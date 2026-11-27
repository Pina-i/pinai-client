import type { StateCreator } from "zustand"
import type { WsConnectionStatus, WsNotification } from "@pinai/domain/models/ws"
import { addToTimeline, mergeMessageHistory, reconcileOptimistic } from "@pinai/domain/models/dm"
import type { GroupEvent } from "@pinai/domain/models/group-event"
import { withNewDeviceLine, type NewDeviceLine } from "@pinai/domain/models/new-device"
import { foldReaction, type ReactionApplication } from "@pinai/domain/models/reaction"
import type { Message } from "@/lib/types"
import type { AppStore } from "../store"

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
    /** A group's changes, per conversation, shown between its messages and persisted with them. */
    groupEvents: Record<string, GroupEvent[]>
    /**
     * Per conversation, the lines for someone else's device that joined by itself unproven: this
     * device's own entries, persisted with the messages, never archived.
     */
    newDeviceLines: Record<string, readonly NewDeviceLine[]>

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
    /** Merge a group's changes into the conversation's, deduplicating by id. */
    addGroupEvents: (conversationKey: string, events: GroupEvent[]) => void
    /** One line to its conversation's, once per id. */
    addNewDeviceLine: (conversationKey: string, line: NewDeviceLine) => void
    /** Drop what this device keeps of a conversation: its messages, its changes and its lines. */
    forgetConversation: (conversationKey: string) => void
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
    groupEvents: {},
    newDeviceLines: {},

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
                const next = addToTimeline(existing, message)
                if (next === existing) return s
                return { dmMessages: { ...s.dmMessages, [conversationKey]: next } }
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
                    updated[idx] = reconcileOptimistic(existing[idx], message)
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

    addGroupEvents: (conversationKey, events) =>
        set(
            (s) => ({
                groupEvents: {
                    ...s.groupEvents,
                    [conversationKey]: mergeMessageHistory(s.groupEvents[conversationKey] ?? [], events),
                },
            }),
            false,
            "ws/addGroupEvents",
        ),

    addNewDeviceLine: (conversationKey, line) =>
        set(
            (s) => {
                const held = s.newDeviceLines[conversationKey]
                // A value of another shape, read back from the cache, is left as it is.
                if (held !== undefined && !Array.isArray(held)) return s
                const next = withNewDeviceLine(held ?? [], line)
                return next === held ? s : { newDeviceLines: { ...s.newDeviceLines, [conversationKey]: next } }
            },
            false,
            "ws/addNewDeviceLine",
        ),

    forgetConversation: (conversationKey) =>
        set(
            (s) => {
                const dmMessages = { ...s.dmMessages }
                const groupEvents = { ...s.groupEvents }
                const newDeviceLines = { ...s.newDeviceLines }
                delete dmMessages[conversationKey]
                delete groupEvents[conversationKey]
                delete newDeviceLines[conversationKey]
                return { dmMessages, groupEvents, newDeviceLines }
            },
            false,
            "ws/forgetConversation",
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
                const folded = foldReaction(s.dmMessages[conversationKey], s.appliedReactionIds, application, reactedByMe)
                if (!folded) return s
                if (!folded.messages) return { appliedReactionIds: folded.appliedReactionIds }
                return {
                    dmMessages: { ...s.dmMessages, [conversationKey]: folded.messages },
                    appliedReactionIds: folded.appliedReactionIds,
                }
            },
            false,
            "ws/applyReaction",
        ),
})
