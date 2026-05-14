import type { Attachment, DirectMessage, DmConversationSummary } from "@/domain/models/dm"

export interface DmCursor {
    created_at: string
    id: string
}

/** Per-file progress callback fired by `uploadAttachment`. */
export type UploadProgress = (loaded: number, total: number) => void

export interface IDmPort {
    /** GET /api/dm — list all conversations, sorted by most recent first. */
    listConversations(idpUrl: string, accessToken: string): Promise<DmConversationSummary[]>
    /** GET /api/dm/{conversationId} — paginated history (newest first). */
    getConversation(idpUrl: string, accessToken: string, conversationId: string, cursor?: DmCursor): Promise<DirectMessage[]>
    /**
     * POST /api/dm — send a message. After Phase 3 the body carries an
     * MLS ciphertext (base64) instead of plaintext. Reactions live in
     * the encrypted application-message stream and don't have their own
     * port methods anymore.
     *
     * Phase 5b: optional `conversationId` lets the client pin the
     * `conversations.id` to a UUID it already used as the MLS
     * `group_id`. Required on first message; safely omitted afterwards
     * (server reuses the existing conversation).
     */
    sendMessage(
        idpUrl: string,
        accessToken: string,
        recipientAddress: string,
        mlsCiphertext: string,
        replyToId?: string,
        attachmentIds?: string[],
        conversationId?: string,
    ): Promise<DirectMessage>
    /**
     * PATCH /api/dm/{messageId}/edit — replace a message's MLS
     * ciphertext and stamp `edited_at`. The new plaintext lives entirely
     * inside the new ciphertext.
     */
    editMessage(idpUrl: string, accessToken: string, messageId: string, mlsCiphertext: string): Promise<void>
    /**
     * POST /api/dm/{conversationId}/read — bump the caller's
     * `last_read_at`. Called when a new message arrives for the
     * conversation the user is actively viewing, so the server's
     * `unread_count` stays in sync with what the user has actually
     * seen. Without it, the sidebar badge would re-appear once they
     * navigate away.
     */
    markConversationRead(idpUrl: string, accessToken: string, conversationId: string): Promise<void>
    /**
     * POST /api/attachments — upload a single file via multipart/form-data,
     * reporting per-byte progress. Each call uploads exactly one file so the
     * caller can run them in parallel and surface per-file UI state.
     * Backend caps per-request files at 5; exceed that and the call rejects.
     *
     * Phase 5c.4: optional `attachmentId` lets the caller pin the
     * server-side row's UUID — required for the E2EE flow because the
     * AAD baked into the ciphertext is the attachment id.
     */
    uploadAttachment(
        idpUrl: string,
        accessToken: string,
        file: File,
        onProgress?: UploadProgress,
        signal?: AbortSignal,
        attachmentId?: string,
    ): Promise<Attachment>
    /** GET /api/attachments/{id} — resolve to a token-protected blob URL. */
    getAttachmentBlobUrl(idpUrl: string, accessToken: string, attachmentId: string): Promise<string>
}
