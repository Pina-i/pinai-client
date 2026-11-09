import type { ConversationHistory } from "../../models/dm"
import { getConversationHistoryUseCase } from "./get-conversation-history.usecase"
import type { MarkReadDeps, ReadSession } from "./mark-conversation-read.usecase"

/** The history `GET` marks the conversation read on the IdP: a list read already under way would bring the old count back. */
export async function openConversationUseCase(session: ReadSession, conversationId: string, deps: MarkReadDeps): Promise<ConversationHistory> {
    const history = await getConversationHistoryUseCase(session.idpUrl, session.accessToken, conversationId, deps.port)
    deps.refreshList()
    return history
}
