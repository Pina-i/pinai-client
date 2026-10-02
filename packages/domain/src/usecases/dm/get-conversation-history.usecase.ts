import type { ConversationHistory } from "../../models/dm"
import type { DmCursor, IDmPort } from "../../ports/dm.port"

export async function getConversationHistoryUseCase(
    idpUrl: string,
    accessToken: string,
    conversationId: string,
    port: IDmPort,
    cursor?: DmCursor,
): Promise<ConversationHistory> {
    return port.getConversation(idpUrl, accessToken, conversationId, cursor)
}
