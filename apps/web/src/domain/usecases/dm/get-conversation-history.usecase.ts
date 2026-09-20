import type { DirectMessage } from "@/domain/models/dm"
import type { DmCursor, IDmPort } from "@/domain/ports/dm.port"

export async function getConversationHistoryUseCase(
    idpUrl: string,
    accessToken: string,
    conversationId: string,
    port: IDmPort,
    cursor?: DmCursor,
): Promise<DirectMessage[]> {
    return port.getConversation(idpUrl, accessToken, conversationId, cursor)
}
