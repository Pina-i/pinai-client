import { createContext, useContext } from "react"
import { DEFAULT_ACCOUNT_SETTINGS, type NotificationSettings } from "@pinai/domain/models/user-settings"

export interface NotificationSettingsContextValue {
    /** What is muted — account settings, so every device follows it. */
    notifications: NotificationSettings
    setConversationMuted: (conversationId: string, muted: boolean) => void
    setMuteAll: (muted: boolean) => void
}

export const NotificationSettingsContext = createContext<NotificationSettingsContextValue>({
    notifications: DEFAULT_ACCOUNT_SETTINGS.notifications,
    setConversationMuted: () => {},
    setMuteAll: () => {},
})

export function useNotificationSettings(): NotificationSettingsContextValue {
    return useContext(NotificationSettingsContext)
}
