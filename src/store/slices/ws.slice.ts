import type { StateCreator } from "zustand"
import type { WsConnectionStatus, WsNotification } from "@/domain/models/ws"
import type { Message } from "@/lib/types"
import type { AppStore } from "../store"

export interface WsSlice {
    wsStatus: WsConnectionStatus
    notifications: WsNotification[]
    dmMessages: Record<string, Message[]>

    setWsStatus: (status: WsConnectionStatus) => void
    addNotification: (notification: WsNotification) => void
    dismissNotification: (id: string) => void
    clearNotifications: () => void
    pushDmMessage: (conversationKey: string, message: Message) => void
    updateDmConversation: (conversationKey: string, updater: (msgs: Message[]) => Message[]) => void
}

export const createWsSlice: StateCreator<AppStore, [["zustand/devtools", never]], [], WsSlice> = (set) => ({
    wsStatus: "disconnected",
    notifications: [],
    dmMessages: {},

    setWsStatus: (status) => set({ wsStatus: status }, false, "ws/setStatus"),

    addNotification: (notification) =>
        set(
            (s) => ({
                notifications: s.notifications.some((n) => n.id === notification.id)
                    ? s.notifications
                    : [notification, ...s.notifications],
            }),
            false,
            "ws/addNotification",
        ),

    dismissNotification: (id) =>
        set(
            (s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }),
            false,
            "ws/dismissNotification",
        ),

    clearNotifications: () => set({ notifications: [] }, false, "ws/clearNotifications"),

    pushDmMessage: (conversationKey, message) =>
        set(
            (s) => ({
                dmMessages: {
                    ...s.dmMessages,
                    [conversationKey]: [...(s.dmMessages[conversationKey] ?? []), message],
                },
            }),
            false,
            "ws/pushDmMessage",
        ),

    updateDmConversation: (conversationKey, updater) =>
        set(
            (s) => ({
                dmMessages: {
                    ...s.dmMessages,
                    [conversationKey]: updater(s.dmMessages[conversationKey] ?? []),
                },
            }),
            false,
            "ws/updateDmConversation",
        ),
})
