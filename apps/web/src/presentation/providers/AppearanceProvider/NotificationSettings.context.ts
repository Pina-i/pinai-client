import { createContext, useContext } from "react"
import { DEFAULT_ACCOUNT_SETTINGS, type NotificationSettings } from "@pinai/domain/models/user-settings"

export interface NotificationSettingsContextValue {
    /** What is muted — account settings, so every device follows it. A timed "mute all" that lapsed reads as off. */
    notifications: NotificationSettings
    setConversationMuted: (conversationId: string, muted: boolean) => void
    /** `until` is the epoch ms the mute lifts at; `null` keeps it until the user unmutes. */
    setMuteAll: (muted: boolean, until?: number | null) => void
}

export const NotificationSettingsContext = createContext<NotificationSettingsContextValue>({
    notifications: DEFAULT_ACCOUNT_SETTINGS.notifications,
    setConversationMuted: () => {},
    setMuteAll: () => {},
})

export function useNotificationSettings(): NotificationSettingsContextValue {
    return useContext(NotificationSettingsContext)
}
