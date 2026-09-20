import type { DmConversationSummary } from "@/domain/models/dm"
import type { IDmPort } from "@/domain/ports/dm.port"

export async function getDmConversationsUseCase(
    idpUrl: string,
    accessToken: string,
    port: IDmPort,
): Promise<DmConversationSummary[]> {
    return port.listConversations(idpUrl, accessToken)
}
