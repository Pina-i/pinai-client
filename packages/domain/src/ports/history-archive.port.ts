/** The account's history key and its archive of opaque entries (`identity-provider/specs/e2ee.md § 5`). */

import type { CurrentHistoryKey, HistoryKey } from "../models/history-key"

export interface ArchiveEntry {
    id: string
    conversation_id: string
    ciphertext: Uint8Array
    nonce: Uint8Array
    client_message_id?: string
}

export interface ArchivePageCursor {
    after_id: string
    after_created_at: string
}

export interface ArchivePage {
    entries: Array<ArchiveEntry & { created_at: string }>
    next_cursor: ArchivePageCursor | null
}

export interface IHistoryArchivePort {
    /** `GET /api/history/key`: the key in force, `null` before the account's first device sets one. */
    getKey(idpUrl: string, accessToken: string): Promise<CurrentHistoryKey | null>
    /**
     * `PUT /api/history/key`, from a session that named its device. Another device setting that
     * generation first is `IdpError` 409 `history_key_conflict`; the very key set already is a
     * retry, answered as a success.
     */
    setKey(idpUrl: string, accessToken: string, key: HistoryKey): Promise<void>
    /** Entries sealed under `generation`: any other than the current one is `IdpError` 409 `stale_history_key`. */
    uploadBatch(idpUrl: string, accessToken: string, generation: number, entries: ArchiveEntry[]): Promise<number>
    downloadPage(
        idpUrl: string,
        accessToken: string,
        cursor: ArchivePageCursor | null,
        limit?: number,
    ): Promise<ArchivePage>
    /** Erases the entries only — the key and its generation stay. Takes a recent password. */
    wipeArchive(idpUrl: string, accessToken: string): Promise<number>
}
