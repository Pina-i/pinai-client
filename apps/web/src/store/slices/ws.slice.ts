import type { StateCreator } from "zustand"
import type { WsConnectionStatus, WsNotification } from "@pinai/domain/models/ws"
import { mergeMessageHistory } from "@pinai/domain/models/dm"
import type { Message } from "@/lib/types"
import type { AppStore } from "../store"

/** A reaction's effect, keyed by the reaction-message id for dedup. */
export interface ReactionApplication {
    /** The reaction message's own id (the row in `direct_messages`). */
    reaction_message_id: string
    target_message_id: string
    reactor_address: string
    emoji: string
    op: "add" | "remove"
}

export interface WsSlice {
    wsStatus: WsConnectionStatus
    notifications: WsNotification[]
    dmMessages: Record<string, Message[]>
    /**
     * Reaction message_ids we've already folded into `dmMessages`'s
     * `reactions` arrays. Persisted alongside `dmMessages` so reload
     * doesn't double-count, and read by REST history's mapApiMessage
     * to skip already-applied reactions.
     */
    appliedReactionIds: Record<string, true>

    setWsStatus: (status: WsConnectionStatus) => void
    addNotification: (notification: WsNotification) => void
    dismissNotification: (id: string) => void
    clearNotifications: () => void
    pushDmMessage: (conversationKey: string, message: Message) => void
    /**
     * Replace an optimistic message (whose id equals `clientId`) with the
     * server-persisted one, preserving its position in the list. If no
     * optimistic match is found, fall back to push semantics (dedup by id).
     */
    reconcileDmMessage: (conversationKey: string, clientId: string, message: Message) => void
    updateDmConversation: (conversationKey: string, updater: (msgs: Message[]) => Message[]) => void
    /** Merge API-loaded history into the cached messages in time order, deduplicating by id. */
    seedDmMessages: (conversationKey: string, messages: Message[]) => void
    /** Update a single message by id across all conversations. */
    updateMessageById: (messageId: string, updater: (msg: Message) => Message) => void
    /**
     * Patch a single message in one conversation by id. Targeted partial
     * update for fields like `status` / `statusAt`; no-op when the
     * message isn't in `dmMessages[conversationKey]`.
     */
    updateDmMessage: (
        conversationKey: string,
        messageId: string,
        patch: Partial<Message>,
    ) => void
    /**
     * Apply a reaction (`add` / `remove`) to a target message in
     * `dmMessages`. Idempotent: dedup'd by `reaction_message_id` via
     * `appliedReactionIds`. The `reactedByMe` flag is provided up
     * front by the caller (it depends on whether the reactor address
     * matches the local user, which the slice doesn't know).
     */
    applyReaction: (
        conversationKey: string,
        application: ReactionApplication,
        reactedByMe: boolean,
    ) => void
}

export const createWsSlice: StateCreator<AppStore, [["zustand/devtools", never]], [], WsSlice> = (set) => ({
    wsStatus: "disconnected",
    notifications: [],
    dmMessages: {},
    appliedReactionIds: {},

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

    reconcileDmMessage: (conversationKey, clientId, message) =>
        set(
            (s) => {
                const existing = s.dmMessages[conversationKey] ?? []
                const idx = existing.findIndex((m) => m.id === clientId)
                if (idx !== -1) {
                    const updated = [...existing]
                    updated[idx] = message
                    return {
                        dmMessages: { ...s.dmMessages, [conversationKey]: updated },
                    }
                }
                if (existing.some((m) => m.id === message.id)) return s
                return {
                    dmMessages: {
                        ...s.dmMessages,
                        [conversationKey]: [...existing, message],
                    },
                }
            },
            false,
            "ws/reconcileDmMessage",
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
                return {
                    dmMessages: {
                        ...s.dmMessages,
                        [conversationKey]: mergeMessageHistory(existing, messages),
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

    updateDmMessage: (conversationKey, messageId, patch) =>
        set(
            (s) => {
                const existing = s.dmMessages[conversationKey]
                if (!existing) return s
                const idx = existing.findIndex((m) => m.id === messageId)
                if (idx === -1) return s
                const updated = [...existing]
                updated[idx] = { ...updated[idx], ...patch }
                return {
                    dmMessages: { ...s.dmMessages, [conversationKey]: updated },
                }
            },
            false,
            "ws/updateDmMessage",
        ),

    applyReaction: (conversationKey, application, reactedByMe) =>
        set(
            (s) => {
                if (s.appliedReactionIds[application.reaction_message_id]) return s
                const list = s.dmMessages[conversationKey]
                if (!list) {
                    // Conversation isn't loaded — still record the
                    // dedup id so we don't re-apply when it later
                    // mounts via REST.
                    return {
                        appliedReactionIds: {
                            ...s.appliedReactionIds,
                            [application.reaction_message_id]: true,
                        },
                    }
                }
                const idx = list.findIndex((m) => m.id === application.target_message_id)
                if (idx === -1) {
                    return {
                        appliedReactionIds: {
                            ...s.appliedReactionIds,
                            [application.reaction_message_id]: true,
                        },
                    }
                }
                const target = list[idx]
                const reactions = target.reactions ? [...target.reactions] : []
                const existingIdx = reactions.findIndex((r) => r.emoji === application.emoji)

                if (application.op === "add") {
                    if (existingIdx === -1) {
                        reactions.push({
                            emoji: application.emoji,
                            count: 1,
                            reacted: reactedByMe,
                        })
                    } else {
                        const r = reactions[existingIdx]
                        reactions[existingIdx] = {
                            ...r,
                            count: r.count + 1,
                            reacted: r.reacted || reactedByMe,
                        }
                    }
                } else {
                    if (existingIdx !== -1) {
                        const r = reactions[existingIdx]
                        const nextCount = r.count - 1
                        if (nextCount <= 0) {
                            reactions.splice(existingIdx, 1)
                        } else {
                            reactions[existingIdx] = {
                                ...r,
                                count: nextCount,
                                reacted: reactedByMe ? false : r.reacted,
                            }
                        }
                    }
                }

                const updatedMessages = [...list]
                updatedMessages[idx] = { ...target, reactions }
                return {
                    dmMessages: {
                        ...s.dmMessages,
                        [conversationKey]: updatedMessages,
                    },
                    appliedReactionIds: {
                        ...s.appliedReactionIds,
                        [application.reaction_message_id]: true,
                    },
                }
            },
            false,
            "ws/applyReaction",
        ),
})
