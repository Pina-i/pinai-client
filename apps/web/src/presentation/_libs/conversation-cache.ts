import type { IConversationCache } from "@pinai/domain/ports/conversation-cache.port"
import type { Message } from "@/lib/types"
import { conversationTimeline } from "@/store/slices/ws.slice"
import { useAppStore } from "@/store/store"
import { timelineMessage } from "@/presentation/_libs/timeline-message"

/** The persisted store as the domain's conversation cache: the account's only decrypted copy of its history. */
export const conversationCache: IConversationCache<Message> = {
    read: async (conversationId) => conversationTimeline(useAppStore.getState(), conversationId),
    update: async (conversationId, change) => useAppStore.getState().changeTimeline(conversationId, change),
    conversationIds: async () => Object.keys(useAppStore.getState().dmMessages),
    toCached: timelineMessage,
}
