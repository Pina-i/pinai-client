import { reactionsToReplay, type RestoredMessage } from "@pinai/domain/models/history-archive"
import { addressParts } from "@pinai/domain/models/identity"
import type { Message } from "@/lib/types"
import { useAppStore } from "@/store/store"

/**
 * The archive's messages into the store through its own actions: each conversation seeded, then the
 * reactions the cache doesn't hold applied through the live path, which records each id — history
 * may decrypt one of them again. One conversation a turn, so a large archive doesn't hold the page.
 */
export async function replayRestoredHistory(messages: readonly RestoredMessage[]): Promise<void> {
    const byConversation = new Map<string, RestoredMessage[]>()
    for (const m of messages) {
        const list = byConversation.get(m.conversationId) ?? []
        list.push(m)
        byConversation.set(m.conversationId, list)
    }
    for (const [conversationId, restored] of byConversation) {
        const store = useAppStore.getState()
        const me = store.user?.address
        const replay = reactionsToReplay(store.dmMessages[conversationId] ?? [], restored)
        store.seedDmMessages(conversationId, restored.map(restoredToMessage))
        for (const { messageId, reaction } of replay) {
            store.applyReaction(
                conversationId,
                {
                    reaction_message_id: reaction.id,
                    target_message_id: messageId,
                    reactor_address: reaction.reactorAddress,
                    emoji: reaction.emoji,
                    op: "add",
                },
                reaction.reactorAddress === me,
            )
        }
        await new Promise((resolve) => setTimeout(resolve, 0))
    }
}

function restoredToMessage(m: RestoredMessage): Message {
    const author = m.senderDisplayName?.trim() || addressParts(m.senderAddress).handle || "Restored"
    return {
        id: m.id,
        author,
        authorAddress: m.senderAddress,
        avatar: author.slice(0, 2).toUpperCase(),
        content: m.text,
        timestamp: new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        createdAt: m.createdAt,
        color: "#a78bfa",
        ...(m.edited ? { edited: true } : {}),
        attachments: m.attachments,
        ...(m.attachmentKeys.length > 0
            ? { attachmentKeys: Object.fromEntries(m.attachmentKeys.map((k) => [k.id, k])) }
            : {}),
        ...(m.replyTo ? { replyTo: m.replyTo } : {}),
    }
}
