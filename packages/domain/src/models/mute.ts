import type { UserStatus } from "./presence"
import type { NotificationSettings } from "./user-settings"

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
