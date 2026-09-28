import { useNotificationSettings } from "@/presentation/providers/AppearanceProvider/NotificationSettings.context"

/**
 * A conversation's own mute, for the menus that toggle it. "Mute all"
 * overrides it without changing it, so it is not reflected here.
 * `toggleMute` is undefined when there is no conversation to mute yet.
 */
export function useConversationMute(conversationId: string | undefined) {
    const { notifications, setConversationMuted } = useNotificationSettings()
    const isMuted = conversationId !== undefined && notifications.mutedConversations.includes(conversationId)
    const toggleMute = conversationId === undefined ? undefined : () => setConversationMuted(conversationId, !isMuted)
    return { isMuted, toggleMute }
}
