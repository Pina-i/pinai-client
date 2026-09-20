import type { DmConversationSummary } from "../../models/dm"
import type { IDmPort } from "../../ports/dm.port"

export async function getDmConversationsUseCase(
    idpUrl: string,
    accessToken: string,
    port: IDmPort,
): Promise<DmConversationSummary[]> {
    return port.listConversations(idpUrl, accessToken)
}
