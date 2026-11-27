import type { UserProfile } from "@pinai/domain/models/auth"
import type { CachedTimelineMessage } from "@pinai/domain/ports/conversation-cache.port"
import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import { MessageSends, type SendContext } from "@pinai/domain/usecases/dm/send-message.usecase"
import { getConversationCache, getDmPort, getE2eePort, getGroupPort } from "@/ioc"
import { conversationJoins, joinContext } from "./conversation-joins"
import { warnE2ee } from "./warn-e2ee"

// One per account's core: a send under way is never failed as stale, whichever screen opens its conversation again.
let sends: { over: IE2eePort; running: MessageSends<CachedTimelineMessage> } | null = null

export function messageSends(): MessageSends<CachedTimelineMessage> {
    const port = getE2eePort()
    if (sends?.over !== port) {
        const running = new MessageSends<CachedTimelineMessage>({
            e2ee: port,
            dm: getDmPort(),
            group: getGroupPort(),
            cache: getConversationCache(),
            joins: { whenIn: (context, conversationId) => conversationJoins().whenIn(context, conversationId) },
            newId: () => crypto.randomUUID(),
            report: (stage, error) => warnE2ee(`sending a message, failed at ${stage}`, error),
        })
        sends = { over: port, running }
    }
    return sends.running
}

export function sendContext(idpUrl: string, user: Pick<UserProfile, "address" | "display_name" | "preferred_username">): SendContext {
    return { ...joinContext(idpUrl), me: { address: user.address, name: user.display_name ?? user.preferred_username } }
}
