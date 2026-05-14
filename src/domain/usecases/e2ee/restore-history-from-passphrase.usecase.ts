import type { IE2eePort } from "@/domain/ports/e2ee.port"

export interface RestoreHistoryDeps {
    e2eePort: IE2eePort
}
export interface RestoreHistoryInput {
    idpUrl: string
    accessToken: string
    passphrase: string[]
}

/**
 * Phase 7 — Layer B restore. The trigger UI (page route + viewmodel
 * that calls this) is deferred; the use case itself is functional and
 * unit-tested.
 *
 * Returns counts: `restored` = successful decrypts; `skipped` =
 * AES-GCM auth-tag failures (wrong passphrase or no matching archive).
 */
export const restoreHistoryFromPassphraseUseCase =
    ({ e2eePort }: RestoreHistoryDeps) =>
    (input: RestoreHistoryInput): Promise<{ restored: number; skipped: number }> =>
        e2eePort.restoreHistoryFromPassphrase(
            input.idpUrl,
            input.accessToken,
            input.passphrase,
        )
