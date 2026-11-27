import type { SendState } from "../models/dm"
import type { GroupEvent } from "../models/group-event"
import type { CachedMessage } from "../models/history-rearchive"
import type { NewDeviceLine } from "../models/new-device"
import type { ReceivedText } from "../models/received-message"

/** What the domain reads of a cached message; each client's own shape adds its looks. */
export type CachedTimelineMessage = CachedMessage & SendState

/** One conversation as this device keeps it: the only decrypted copy of its history. */
export interface ConversationTimeline<M> {
    messages: M[]
    /** The reactions folded into these messages, by their own message id: one decrypted again would count twice. */
    appliedReactionIds: Readonly<Record<string, true>>
    groupEvents: GroupEvent[]
    newDeviceLines: readonly NewDeviceLine[]
}

/**
 * The conversations' timelines, read and changed one conversation at a time: the web's store, the phone's sealed rows.
 * Asynchronous, as a sealed row is read; never mutated in place — a change gives back what it replaces.
 */
export interface IConversationCache<M> {
    /** What is held of a conversation, empty when nothing is. */
    read(conversationId: string): Promise<ConversationTimeline<M>>
    /** `change` applied to what is held as it runs; a field it gives back as it was given is not written. */
    update(conversationId: string, change: (held: ConversationTimeline<M>) => ConversationTimeline<M>): Promise<void>
    /** The conversations holding messages. */
    conversationIds(): Promise<string[]>
    /** A message in the shape this cache holds. */
    toCached(message: ReceivedText & SendState): M
}
