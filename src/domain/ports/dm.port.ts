import type { DirectMessage, DmConversationSummary } from "@/domain/models/dm"

export interface DmCursor {
    created_at: string
    id: string
}

export interface IDmPort {
    /** GET /api/dm — list all conversations, sorted by most recent first. */
    listConversations(idpUrl: string, accessToken: string): Promise<DmConversationSummary[]>
    /** GET /api/dm/{conversationId} — paginated history (newest first). */
    getConversation(idpUrl: string, accessToken: string, conversationId: string, cursor?: DmCursor): Promise<DirectMessage[]>
    /** POST /api/dm — send a message (supports replies via replyToId). */
    sendMessage(idpUrl: string, accessToken: string, recipientAddress: string, content: string, replyToId?: string): Promise<DirectMessage>
    /** POST /api/dm/{messageId}/reactions — add a reaction. */
    addReaction(idpUrl: string, accessToken: string, messageId: string, emoji: string): Promise<void>
    /** DELETE /api/dm/{messageId}/reactions?emoji=... — remove a reaction. */
    removeReaction(idpUrl: string, accessToken: string, messageId: string, emoji: string): Promise<void>
    /** PATCH /api/dm/{messageId}/edit — edit a message's content. */
    editMessage(idpUrl: string, accessToken: string, messageId: string, content: string): Promise<void>
}
