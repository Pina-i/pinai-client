import type { DirectMessage, DmConversationSummary } from "@/domain/models/dm"

export interface DmCursor {
    created_at: string
    id: string
}

export interface IDmPort {
    /** GET /api/dm — list all DM conversations, sorted by most recent first. */
    listConversations(idpUrl: string, accessToken: string): Promise<DmConversationSummary[]>
    /** GET /api/dm/{address} — paginated history (newest first). */
    getConversation(idpUrl: string, accessToken: string, address: string, cursor?: DmCursor): Promise<DirectMessage[]>
}
