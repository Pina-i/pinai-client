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
    /** Prepend historical messages (API-loaded) before any live WS messages, deduplicating by id. */
    seedDmMessages: (conversationKey: string, messages: Message[]) => void
    /** Update a single message by id across all conversations. */
    updateMessageById: (messageId: string, updater: (msg: Message) => Message) => void
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
            (s) => {
                const existing = s.dmMessages[conversationKey] ?? []
                if (existing.some((m) => m.id === message.id)) return s
                return {
                    dmMessages: {
                        ...s.dmMessages,
                        [conversationKey]: [...existing, message],
                    },
                }
            },
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

    seedDmMessages: (conversationKey, messages) =>
        set(
            (s) => {
                const existing = s.dmMessages[conversationKey] ?? []
                const existingIds = new Set(existing.map((m) => m.id))
                const historical = messages.filter((m) => !existingIds.has(m.id))
                return {
                    dmMessages: {
                        ...s.dmMessages,
                        [conversationKey]: [...historical, ...existing],
                    },
                }
            },
            false,
            "ws/seedDmMessages",
        ),

    updateMessageById: (messageId, updater) =>
        set(
            (s) => {
                const dmMessages = { ...s.dmMessages }
                for (const key of Object.keys(dmMessages)) {
                    const msgs = dmMessages[key]
                    const idx = msgs.findIndex((m) => m.id === messageId)
                    if (idx !== -1) {
                        const updated = [...msgs]
                        updated[idx] = updater(updated[idx])
                        dmMessages[key] = updated
                        break
                    }
                }
                return { dmMessages }
            },
            false,
            "ws/updateMessageById",
        ),
})
