import type { IE2eePort } from "../../ports/e2ee.port"

export interface RestoreHistoryDeps {
    e2eePort: IE2eePort
}
export interface RestoreHistoryInput {
    idpUrl: string
    accessToken: string
    passphrase: string[]
}

/** `skipped` counts AES-GCM auth-tag failures (wrong passphrase or unrelated archive). */
export const restoreHistoryFromPassphraseUseCase =
    ({ e2eePort }: RestoreHistoryDeps) =>
    (input: RestoreHistoryInput): Promise<{ restored: number; skipped: number }> =>
        e2eePort.restoreHistoryFromPassphrase(
            input.idpUrl,
            input.accessToken,
            input.passphrase,
        )
