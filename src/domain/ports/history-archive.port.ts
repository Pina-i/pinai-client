/**
 * Phase 7 — REST surface for the server-side history archive.
 *
 * The browser side: encrypts plaintext under the History Archive Key
 * (see `history-archive.adapter.ts`) and ships ciphertext entries here.
 * The server side: opaque storage in `history_messages` (cf.
 * `identity-provider/crates/e2ee/src/history.rs`).
 */

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
    uploadBatch(idpUrl: string, accessToken: string, entries: ArchiveEntry[]): Promise<number>
    downloadPage(
        idpUrl: string,
        accessToken: string,
        cursor: ArchivePageCursor | null,
        limit?: number,
    ): Promise<ArchivePage>
    wipeArchive(idpUrl: string, accessToken: string): Promise<number>
    getSalt(idpUrl: string, accessToken: string): Promise<Uint8Array | null>
    setSalt(idpUrl: string, accessToken: string, salt: Uint8Array): Promise<Uint8Array>
}
