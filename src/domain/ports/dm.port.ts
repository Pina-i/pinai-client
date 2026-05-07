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
    /** POST /api/dm — send a message (supports replies + attachments). */
    sendMessage(
        idpUrl: string,
        accessToken: string,
        recipientAddress: string,
        content: string,
        replyToId?: string,
        attachmentIds?: string[],
    ): Promise<DirectMessage>
    /** POST /api/dm/{messageId}/reactions — add a reaction. */
    addReaction(idpUrl: string, accessToken: string, messageId: string, emoji: string): Promise<void>
    /** DELETE /api/dm/{messageId}/reactions?emoji=... — remove a reaction. */
    removeReaction(idpUrl: string, accessToken: string, messageId: string, emoji: string): Promise<void>
    /** PATCH /api/dm/{messageId}/edit — edit a message's content. */
    editMessage(idpUrl: string, accessToken: string, messageId: string, content: string): Promise<void>
    /**
     * POST /api/attachments — upload a single file via multipart/form-data,
     * reporting per-byte progress. Each call uploads exactly one file so the
     * caller can run them in parallel and surface per-file UI state.
     * Backend caps per-request files at 5; exceed that and the call rejects.
     */
    uploadAttachment(
        idpUrl: string,
        accessToken: string,
        file: File,
        onProgress?: UploadProgress,
        signal?: AbortSignal,
    ): Promise<Attachment>
    /** GET /api/attachments/{id} — resolve to a token-protected blob URL. */
    getAttachmentBlobUrl(idpUrl: string, accessToken: string, attachmentId: string): Promise<string>
}
