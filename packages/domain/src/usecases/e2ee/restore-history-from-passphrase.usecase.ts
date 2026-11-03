import { restoredMessages, type RestoredMessage } from "../../models/history-archive"
import type { IE2eePort } from "../../ports/e2ee.port"

export interface RestoreHistoryDeps {
    e2eePort: IE2eePort
}
export interface RestoreHistoryInput {
    idpUrl: string
    accessToken: string
    passphrase: string[]
}
export interface RestoredHistory {
    messages: RestoredMessage[]
    /** Entries the passphrase opened. */
    decrypted: number
    /** AES-GCM auth-tag failures (wrong passphrase or unrelated archive). */
    skipped: number
}

export const restoreHistoryFromPassphraseUseCase =
    ({ e2eePort }: RestoreHistoryDeps) =>
    async (input: RestoreHistoryInput): Promise<RestoredHistory> => {
        const { entries, skipped } = await e2eePort.restoreHistoryFromPassphrase(
            input.idpUrl,
            input.accessToken,
            input.passphrase,
        )
        return { messages: restoredMessages(entries), decrypted: entries.length, skipped }
    }
