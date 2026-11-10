import { isBeingRead } from "../../models/attention"
import { countsAsUnread } from "../../models/block"
import { type MarkReadDeps, type ReadSession, markConversationReadUseCase } from "./mark-conversation-read.usecase"

/** What is true as the message arrives. */
export interface IncomingMessage {
    conversationId: string
    openId: string | null
    windowAttended: boolean
    senderBlocked: boolean
}

export interface SettleReadDeps extends MarkReadDeps {
    countUnread: (conversationId: string) => void
}

/** A message from someone else: marked read on the IdP if it is being read, else one more unread. */
export async function settleIncomingReadUseCase(
    message: IncomingMessage,
    session: ReadSession | null,
    deps: SettleReadDeps,
): Promise<void> {
    const beingRead = isBeingRead(message.openId === message.conversationId, message.windowAttended)
    if (beingRead && session) return markConversationReadUseCase(session, message.conversationId, deps)
    if (countsAsUnread(beingRead, message.senderBlocked)) deps.countUnread(message.conversationId)
    deps.refreshList()
}
