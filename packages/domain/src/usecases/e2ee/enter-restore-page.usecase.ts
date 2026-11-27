import { replacedOn, resetCause, type Admission, type GateRoute, type ResetCause } from "../../models/admission"
import type { DeviceListEntry } from "../../models/device"
import type { DeviceId } from "../../models/e2ee"
import type { HistoryKeyStanding } from "../../models/history-key"
import type { RestoreVariant } from "../../models/restore-page"
import type { IE2eePort } from "../../ports/e2ee.port"

import { pendingKeyRoute } from "./gate-this-device.usecase"
import type { GateSession } from "./onboarding-gate.usecase"

/** What the page read once the device was set up. */
export interface RestorePageReading {
    isIn: boolean
    lacksWords: boolean
    /** Set together: a newer generation's title waits for its setter, so it never changes under the user's eyes. */
    reset: { cause: ResetCause | null; replacedOn: string | null; refused: DeviceId | null }
}

export type RestorePageEntry =
    /** A pending key — a start over cut short by a reload: the setup page settles it. */
    | { kind: "go"; route: GateRoute }
    | { kind: "new-words"; words: string[] }
    /** The reset page is for a device that is out: one let in meanwhile goes back to the app. */
    | { kind: "home" }
    /** `read` is `null` when whether it is in couldn't be read. */
    | { kind: "ready"; read: RestorePageReading | null }
    | { kind: "signing-in-again"; error: unknown }
    | { kind: "failed"; error: unknown; message: string }
    | { kind: "cancelled" }

export interface EnterRestorePageDeps {
    e2eePort: Pick<IE2eePort, "historyKeyStanding" | "pendingHistoryKey" | "newWordsToShow" | "resetSetter">
    /** `setUpThisDeviceUseCase`: registered and named on its session, no KeyPackage published. */
    setUp: (session: GateSession) => Promise<void>
    /** `checkAdmissionUseCase` over the platform's admission ports. */
    checkAdmission: (session: GateSession) => Promise<{ standing: HistoryKeyStanding; admission: Admission }>
    listDevices: (session: GateSession) => Promise<readonly DeviceListEntry[]>
    signInAgainOnDeviceMismatch: (error: unknown) => Promise<boolean>
    warn?: (what: string, error: unknown) => void
}

export interface EnterRestorePageHooks {
    /** The gate recorded an unknown change it sent the device here on: said at once. */
    onEarlyCause?: (cause: ResetCause) => void
    /** Set up: it can ask another device to approve it, or start over. */
    onDeviceReady?: () => void
    cancelled?: () => boolean
}

/**
 * The new-device and reset page as it opens: a pending key goes to the setup page, a start over's new words are
 * shown; else the device is set up (registered, named, no KeyPackage), then whether it is in and lacks the words is
 * read, with a reset's cause — after a newer generation, the device found approved that set it, named and refused.
 */
export function enterRestorePageUseCase(deps: EnterRestorePageDeps) {
    return async (session: GateSession, variant: RestoreVariant, hooks: EnterRestorePageHooks = {}): Promise<RestorePageEntry> => {
        const cancelled = hooks.cancelled ?? (() => false)
        const port = deps.e2eePort
        void port.historyKeyStanding().then(
            (standing) => {
                if (!cancelled() && resetCause(standing) === "unknown-change") hooks.onEarlyCause?.("unknown-change")
            },
            () => undefined
        )
        try {
            const pending = await pendingKeyRoute(port)
            if (pending) return cancelled() ? { kind: "cancelled" } : { kind: "go", route: pending }
            const unseen = await port.newWordsToShow()
            if (unseen) return cancelled() ? { kind: "cancelled" } : { kind: "new-words", words: unseen.words }
            await deps.setUp(session)
            if (cancelled()) return { kind: "cancelled" }
            hooks.onDeviceReady?.()
            let read: RestorePageReading | null = null
            try {
                const { standing, admission } = await deps.checkAdmission(session)
                if (cancelled()) return { kind: "cancelled" }
                if (variant === "reset" && admission.kind === "in") return { kind: "home" }
                const cause = resetCause(standing)
                let setterLabel: string | null = null
                let refused: DeviceId | null = null
                if (variant === "reset" && cause === "newer-generation") {
                    try {
                        const devices = await deps.listDevices(session)
                        const setter = await port.resetSetter(devices)
                        setterLabel = replacedOn(standing, setter, devices)
                        refused = setter && !setter.self ? setter.deviceId : null
                    } catch (error) {
                        deps.warn?.("reading who replaced the words", error)
                    }
                }
                read = { isIn: admission.kind === "in", lacksWords: standing.kind !== "holds", reset: { cause, replacedOn: setterLabel, refused } }
            } catch (error) {
                deps.warn?.("reading whether this device is in", error)
            }
            return cancelled() ? { kind: "cancelled" } : { kind: "ready", read }
        } catch (error) {
            if (cancelled()) return { kind: "cancelled" }
            if (await deps.signInAgainOnDeviceMismatch(error)) return { kind: "signing-in-again", error }
            return { kind: "failed", error, message: error instanceof Error ? error.message : "Could not set up this device." }
        }
    }
}
