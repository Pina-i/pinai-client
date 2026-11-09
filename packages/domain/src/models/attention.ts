import { isConversationMuted } from "./mute"
import type { NotificationSettings } from "./user-settings"

export interface AttentionConversation {
    id: string
    removedAt: string | null
}

export interface AttentionSources {
    conversations: readonly AttentionConversation[]
    unread: Readonly<Record<string, number>>
    openId: string | null
    windowAttended: boolean
    /** As `notificationsAt` gives them: a lapsed "mute all" reads as off. */
    notifications: NotificationSettings
    bellUnread: number
}

/** Open on a window the user can see and is in: open behind another window or minimised, it waits unread. */
export function isBeingRead(open: boolean, windowAttended: boolean): boolean {
    return open && windowAttended
}

/** The IdP's count can lag the local one, either way: either says there is something to mark read. */
export function needsMarkingRead(localUnread: number, listedUnread: number): boolean {
    return localUnread > 0 || listedUnread > 0
}

/** By id, not by count: accepting or declining a request takes it out of the list. */
export function unseenNotifications<N extends { id: string }>(notifications: readonly N[], seenIds: ReadonlySet<string>): N[] {
    return notifications.filter((notification) => !seenIds.has(notification.id))
}

export function attentionCount({ conversations, unread, openId, windowAttended, notifications, bellUnread }: AttentionSources): number {
    let count = Math.max(0, bellUnread)
    for (const conversation of conversations) {
        if (isBeingRead(conversation.id === openId, windowAttended)) continue
        // The sidebar may still show a removed group's pill, but nothing there waits for the user.
        if (conversation.removedAt !== null) continue
        if (isConversationMuted(notifications, conversation.id)) continue
        count += Math.max(0, unread[conversation.id] ?? 0)
    }
    return count
}

/** The app's name, as the window's title and the tray's tooltip give it (`index.html`'s `<title>`). */
export const APP_TITLE = "Pīna'i"

export function titleWithCount(base: string, count: number): string {
    return count > 0 ? `${base} (${count})` : base
}

export const BADGE_LABEL_MAX = 99

export function badgeLabel(count: number): string {
    if (count <= 0) return ""
    return count > BADGE_LABEL_MAX ? `${BADGE_LABEL_MAX}+` : String(count)
}
