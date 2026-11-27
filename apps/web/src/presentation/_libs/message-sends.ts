import type { UserProfile } from "@pinai/domain/models/auth"
import { MessageSends, type SendContext } from "@pinai/domain/usecases/dm/send-message.usecase"
import { getDmPort, getE2eePort, getGroupPort } from "@/ioc"
import type { Message } from "@/lib/types"
import { conversationCache } from "@/presentation/_libs/conversation-cache"
import { conversationJoins, joinContext } from "@/presentation/_libs/conversation-joins"

// One for the page load: a send under way is never failed as stale, whichever page opens its conversation again.
let sends: MessageSends<Message> | null = null

export function messageSends(): MessageSends<Message> {
    sends ??= new MessageSends<Message>({
        e2ee: getE2eePort(),
        dm: getDmPort(),
        group: getGroupPort(),
        cache: conversationCache,
        joins: { whenIn: (context, conversationId) => conversationJoins().whenIn(context, conversationId) },
        newId: () => crypto.randomUUID(),
        // eslint-disable-next-line no-console
        report: (stage, error) => console.warn(`Send failed at ${stage}:`, error),
    })
    return sends
}

export function sendContext(idpUrl: string, user: Pick<UserProfile, "address" | "display_name" | "preferred_username">): SendContext {
    return { ...joinContext(idpUrl), me: { address: user.address, name: user.display_name ?? user.preferred_username } }
}
