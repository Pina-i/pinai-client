import { groupFact, lastMessagePreview, type ConversationRow } from "@pinai/domain/models/conversation-list"
import type { DmConversationSummary } from "@pinai/domain/models/dm"
import { rowTime } from "@/presentation/_libs/message-time"
import { useConversationTimeline } from "@/presentation/hooks/use-conversation-timeline"
import { useAppStore } from "@/store/store"

/** A row of the list: its line from what this phone holds decrypted, its count and time from the IdP's list. */
export function useConversationRowViewModel(row: ConversationRow, summary: DmConversationSummary) {
    const myAddress = useAppStore((s) => s.user?.address)
    // Its own mute only, as the web's row: "mute all" changes no row.
    const muted = useAppStore((s) => s.notifications.mutedConversations.includes(row.id))
    const timeline = useConversationTimeline(row.id)
    const messages = timeline?.messages
    const isGroup = row.kind === "group"
    const removed = row.removedAt !== null
    const showsMuted = muted && !removed
    const preview = isGroup ? null : lastMessagePreview(messages, myAddress)
    const line = showsMuted ? "Muted" : isGroup ? groupFact(row) : preview
    const lastAt = summary.last_message_at ?? messages?.[messages.length - 1]?.createdAt
    const time = lastAt ? rowTime(lastAt, new Date()) : null
    const unread = summary.unread_count

    return {
        name: row.displayName,
        isGroup,
        removed,
        muted,
        showsMuted,
        line,
        // A preview is prose; a member count or "Muted" is a fact, set in the mono.
        lineIsFact: line !== preview,
        time,
        unread,
        avatarUrl: isGroup ? null : (summary.members[0]?.avatarUrl ?? null),
        accessibilityLabel: [row.displayName, line, unread > 0 && `${unread} unread`, time].filter(Boolean).join(", "),
    }
}
