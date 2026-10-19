import type { UserStatus } from "./presence"
import type { NotificationSettings } from "./user-settings"

// A timed "mute all" lifts on every device once its end passes, without anyone writing the change.
export function isMuteAllActive(notifications: NotificationSettings, now: number): boolean {
    return notifications.muteAll && (notifications.muteAllUntil === null || now < notifications.muteAllUntil)
}

export function notificationsAt(notifications: NotificationSettings, now: number): NotificationSettings {
    return isMuteAllActive(notifications, now) ? notifications : { ...notifications, muteAll: false, muteAllUntil: null }
}

export function isConversationMuted(notifications: NotificationSettings, conversationId: string): boolean {
    return notifications.muteAll || notifications.mutedConversations.includes(conversationId)
}

export function setConversationMuted(
    notifications: NotificationSettings,
    conversationId: string,
    muted: boolean,
): NotificationSettings {
    const others = notifications.mutedConversations.filter((id) => id !== conversationId)
    return { ...notifications, mutedConversations: muted ? [...others, conversationId] : others }
}

export function shouldPingForMessage(
    notifications: NotificationSettings,
    conversationId: string,
    myStatus: UserStatus,
    senderBlocked: boolean,
): boolean {
    return !senderBlocked && myStatus !== "dnd" && !isConversationMuted(notifications, conversationId)
}

/** Pings closer together than this ring once: a burst — a reconnect catching up — is one sound. */
export const PING_SPACING_MS = 420

export function pingsAgain(lastPingAt: number | null, now: number): boolean {
    return lastPingAt === null || now - lastPingAt >= PING_SPACING_MS
}
