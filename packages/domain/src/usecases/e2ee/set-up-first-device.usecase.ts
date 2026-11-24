import type { GateRoute } from "../../models/admission"
import { firstWordsShownOffline } from "../../models/history-key"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { FirstDeviceOutcome } from "./bootstrap-first-device.usecase"
import type { GateSession } from "./onboarding-gate.usecase"

/** A pending key written moments ago is left for a later settle; the setup tries again until it is. */
export const PENDING_RECHECK_MS = 15_000

/** What the first device's setup page shows, or where it goes. */
export type SetupOutcome =
    | { kind: "words"; words: string[] }
    /** A start over's words, set and not yet gone past. */
    | { kind: "new-words"; words: string[] }
    | { kind: "retry"; afterMs: number }
    | { kind: "go"; route: GateRoute }
    | { kind: "signing-in-again" }
    | { kind: "failed"; message: string }
    | { kind: "cancelled" }

export interface SetUpFirstDeviceDeps {
    e2eePort: Pick<IE2eePort, "loadStoredPassphrase" | "newWordsToShow" | "pendingHistoryKey" | "newestHistoryGeneration">
    /** `bootstrapFirstDeviceUseCase` over the platform's ports. */
    bootstrap: (session: GateSession) => Promise<FirstDeviceOutcome>
    /** The gate's route (`gateThisDeviceUseCase`), without mounting the app on the way. */
    gateRoute: (session: GateSession) => Promise<GateRoute>
    signInAgainOnDeviceMismatch: (error: unknown) => Promise<boolean>
}

/**
 * The first device's setup: the bootstrap, then its 24 words — only once the IdP took the history key they
 * give. New words a start over set and nobody went past come first. A device finding the account has a key
 * another device set goes where the gate sends it; a pending key written moments ago is tried again later.
 * Offline, a reload shows the first generation's words kept (`firstWordsShownOffline`).
 */
export function setUpFirstDeviceUseCase(deps: SetUpFirstDeviceDeps) {
    return async (
        session: GateSession,
        onStage: (stage: "checking" | "running") => void = () => {},
        cancelled: () => boolean = () => false
    ): Promise<SetupOutcome> => {
        const port = deps.e2eePort
        const newWords = async (): Promise<SetupOutcome | null> => {
            const unseen = await port.newWordsToShow()
            return unseen ? { kind: "new-words", words: unseen.words } : null
        }
        let kept: string[] | null = null
        try {
            // Words kept already (a reload after setup) are only checked.
            kept = await port.loadStoredPassphrase()
            if (cancelled()) return { kind: "cancelled" }
            onStage(kept ? "checking" : "running")
            const outcome = await deps.bootstrap(session)
            if (cancelled()) return { kind: "cancelled" }
            const unseen = await newWords()
            if (unseen) return unseen
            if (outcome.kind === "has-key") {
                if (await port.pendingHistoryKey()) return { kind: "retry", afterMs: PENDING_RECHECK_MS }
                return { kind: "go", route: await deps.gateRoute(session) }
            }
            return { kind: "words", words: outcome.words }
        } catch (error) {
            if (cancelled()) return { kind: "cancelled" }
            if (await deps.signInAgainOnDeviceMismatch(error)) return { kind: "signing-in-again" }
            const unseen = await newWords().catch(() => null)
            if (unseen) return unseen
            // The first device's words, which the IdP took already: an IdP out of reach doesn't take them back.
            const offline = await Promise.all([port.newestHistoryGeneration(), port.pendingHistoryKey()]).then(
                ([newest, pending]) => firstWordsShownOffline(newest, pending !== null),
                () => false
            )
            if (kept && offline) return { kind: "words", words: kept }
            return { kind: "failed", message: error instanceof Error ? error.message : "Setup failed." }
        }
    }
}
