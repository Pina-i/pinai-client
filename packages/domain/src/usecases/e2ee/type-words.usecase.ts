import type { GateSession } from "./onboarding-gate.usecase"
import type { HistoryRestoreState } from "./restore-due-history.usecase"
import type { PassphraseRestore } from "./restore-history-from-passphrase.usecase"

/** What typing the 24 words came to, for the screen to say. */
export type TypedWordsOutcome =
    | { kind: "kept"; restore: { kind: "restored"; messages: number } | { kind: "failed" } }
    | { kind: "refused"; reason: Exclude<PassphraseRestore["kind"], "kept"> }
    | { kind: "signing-in-again" }
    | { kind: "failed"; message: string }

export interface TypeWordsDeps {
    /** `restoreHistoryFromPassphraseUseCase` over the platform's ports. */
    restoreFromWords: (session: GateSession, words: string[]) => Promise<PassphraseRestore>
    /** The restore due once the words are held — the platform's `HistoryRestore`, its cache read back. */
    restoreDue: () => Promise<HistoryRestoreState>
    signInAgainOnDeviceMismatch: (error: unknown) => Promise<boolean>
}

/**
 * The 24 words typed — on the new-device page, the reset page, the app's banner: checked against the account's
 * key before anything is kept, then the history restored, awaited. `ready` — the screen's own setup of the
 * device — comes first.
 */
export function typeWordsUseCase(deps: TypeWordsDeps) {
    return async (session: GateSession, words: string[], ready?: () => Promise<void> | null): Promise<TypedWordsOutcome> => {
        try {
            await ready?.()
            const result = await deps.restoreFromWords(session, words)
            if (result.kind !== "kept") return { kind: "refused", reason: result.kind }
            const restore = await deps.restoreDue()
            return {
                kind: "kept",
                restore:
                    restore.kind === "failed"
                        ? { kind: "failed" }
                        : { kind: "restored", messages: restore.kind === "restored" ? restore.messages : 0 },
            }
        } catch (error) {
            if (await deps.signInAgainOnDeviceMismatch(error)) return { kind: "signing-in-again" }
            return { kind: "failed", message: error instanceof Error ? error.message : "Restore failed" }
        }
    }
}
