import type { GroupEvent } from "./group-event"
import { addressParts } from "./identity"

/** Attachment metadata as returned by the IdP REST API and on the WS new_dm event. */
export interface Attachment {
    id: string
    mime_type: string
    byte_size: number
    original_filename: string
}

/**
 * Raw API response: a single direct message.
 *
 * After Phase 3 the body on the wire is opaque MLS ciphertext, base64-encoded.
 * Reactions, reply previews, and edited content live inside the encrypted
 * stream — server only sees `reply_to_id` for thread routing. Plaintext is
 * reconstructed locally via `IE2eePort.decryptInbound` and cached under
 * `data.plaintextByMessageId` for re-render after MLS forward secrecy
 * deletes the per-message keys.
 */
export interface DirectMessage {
    id: string
    conversation_id: string
    sender_actor_uri: string
    sender_display_name: string | null
    /** Base64 of the TLS-encoded MLSMessage. Server never inspects. */
    mls_ciphertext: string
    activity_uri: string
    federation_status: "pending" | "delivered" | "failed"
    created_at: string
    edited_at: string | null
    /** Server-visible parent ID for thread routing. Preview lives in MLS body. */
    reply_to_id: string | null
    attachments?: Attachment[]
}

/** Member info in a conversation list entry. */
export interface ConversationMemberInfo {
    actorUri: string
    displayName: string | null
    avatarUrl: string | null
}

/**
 * Raw API response: one entry from GET /api/dm (conversation list).
 *
 * Phase 3 dropped `last_message_preview` — the body is opaque ciphertext
 * server-side; the client reconstructs a preview from its decrypted MLS
 * stream (Phase 5+).
 */
export interface DmConversationSummary {
    conversation_id: string
    kind: "dm" | "group"
    name: string | null
    members: ConversationMemberInfo[]
    last_message_sender: string | null
    unread_count: number
    last_message_at: string | null
    /**
     * When the caller was removed from this group; `null` while they are in it. A removed group
     * stays listed as it stood then, with its history up to the removal, until they clear it.
     */
    removed_at: string | null
}

/** A page of `GET /api/dm/{id}`, newest first: the messages, and a group's changes among them. */
export interface ConversationHistory {
    messages: DirectMessage[]
    events: GroupEvent[]
}


/** Anything placed on a conversation's timeline. */
export interface TimelineEntry {
    id: string
    /** ISO 8601 instant. */
    createdAt: string
}

/** A message this device couldn't decrypt: shown as a placeholder until a decrypted copy comes. */
export interface Decryption {
    undecrypted?: true
}

// The held copy wins — it is the one already decrypted — unless only the other is: that one then
// takes over, with what only the held copy knew (reactions folded into it, a send status).
function keepCopy<T extends Decryption>(held: T, other: T): T {
    if (!held.undecrypted || other.undecrypted) return held
    const known = { ...held }
    delete known.undecrypted
    return { ...known, ...other }
}

/**
 * Merge server history (oldest-first) into a conversation's cached timeline.
 * The cache is persisted, so history can hold entries newer than it, not only
 * older ones: sort instead of prepending. Sorting the whole list also repairs
 * a cache an earlier prepend left out of order. A cached entry wins over its
 * history copy, unless this device couldn't decrypt it and history could.
 */
export function mergeMessageHistory<T extends TimelineEntry & Decryption>(cached: T[], history: T[]): T[] {
    const fromHistory = new Map(history.map((m) => [m.id, m]))
    const cachedIds = new Set(cached.map((m) => m.id))
    const incoming = history.filter((m) => !cachedIds.has(m.id))
    const kept = cached.map((m) => {
        const copy = fromHistory.get(m.id)
        return copy ? keepCopy(m, copy) : m
    })
    // Stable sort: on a tie, history stays ahead of the cache.
    return [...incoming, ...kept].sort((a, b) => timeOf(a) - timeOf(b))
}

/**
 * A live entry into a cached timeline: appended when new; for one already held, the copy kept is
 * the held one unless only the new one is decrypted. The same list when nothing changes.
 */
export function addToTimeline<T extends { id: string } & Decryption>(list: T[], entry: T): T[] {
    const at = list.findIndex((m) => m.id === entry.id)
    if (at === -1) return [...list, entry]
    const kept = keepCopy(list[at], entry)
    if (kept === list[at]) return list
    const next = [...list]
    next[at] = kept
    return next
}

export type TimelineItem<M, E> = { kind: "message"; entry: M } | { kind: "event"; entry: E }

/**
 * A conversation's messages and its group's changes as one timeline. The messages keep their
 * order; each change goes before the first message from after it, so before a message of the
 * same instant.
 */
export function interleaveTimeline<M extends TimelineEntry, E extends TimelineEntry>(
    messages: readonly M[],
    events: readonly E[],
): TimelineItem<M, E>[] {
    const items: TimelineItem<M, E>[] = []
    let next = 0
    for (const message of messages) {
        while (next < events.length && timeOf(events[next]) <= timeOf(message)) {
            items.push({ kind: "event", entry: events[next++] })
        }
        items.push({ kind: "message", entry: message })
    }
    for (; next < events.length; next++) items.push({ kind: "event", entry: events[next] })
    return items
}

// An entry from before `createdAt` existed has no usable time; it is old by definition.
function timeOf(entry: TimelineEntry): number {
    const t = Date.parse(entry.createdAt)
    return Number.isNaN(t) ? -Infinity : t
}

/**
 * Where an own message stands. `failed`: the IdP never accepted it, so it is
 * sent again in place. `undelivered`: the IdP stored it but could not reach
 * the recipient's IdP; the row stays as the record of that attempt, and the
 * message is sent again as a new one.
 */
export type SendStatus = "sending" | "sent" | "failed" | "undelivered"

/** The send-lifecycle fields of an own message. */
export interface SendState {
    status?: SendStatus
    /** ISO instant of the last `status` change. */
    statusAt?: string
    /** An undelivered message that was already sent again as a new one. */
    resent?: boolean
    /** On the new message: the id of the undelivered one it was sent again from. */
    resentFrom?: string
}

/**
 * How long a send may stay `sending` before it counts as failed. A page closed
 * mid-send leaves the message `sending` in the persisted cache, where it would
 * never settle on its own, so it could never be retried.
 */
export const SEND_TIMEOUT_MS = 20_000

/**
 * Mark a send that has waited past {@link SEND_TIMEOUT_MS} as failed, so it
 * offers a retry. Returns the same object when nothing changes. An echo that
 * still arrives later reconciles the message to sent as usual.
 */
export function settleStaleSend<T extends SendState>(message: T, now: number): T {
    if (message.status !== "sending" || !message.statusAt) return message
    if (now - Date.parse(message.statusAt) < SEND_TIMEOUT_MS) return message
    return { ...message, status: "failed", statusAt: new Date(now).toISOString() }
}

/**
 * The confirmed copy of an optimistic message replaces it, keeping what only
 * the client knows: which undelivered message it was sent again from.
 */
export function reconcileOptimistic<T extends SendState>(optimistic: T, confirmed: T): T {
    if (!optimistic.resentFrom || confirmed.resentFrom) return confirmed
    return { ...confirmed, resentFrom: optimistic.resentFrom }
}

/**
 * For each undelivered message that was sent again, the message that
 * replaced it — keyed by the undelivered message's id.
 */
export function resentCopies<T extends SendState & { id: string }>(messages: T[]): Map<string, T> {
    const copies = new Map<string, T>()
    for (const m of messages) if (m.resentFrom) copies.set(m.resentFrom, m)
    return copies
}

/**
 * Apply the IdP's delivery outcome to an own message. A failed delivery is
 * final — the IdP never retries it — so it overrides the status the client
 * recorded when the send returned. Returns the same object when nothing changes.
 */
export function applyFederationStatus<T extends SendState>(
    message: T,
    federationStatus: DirectMessage["federation_status"],
    at: string,
): T {
    if (federationStatus !== "failed" || message.status === "undelivered") return message
    return { ...message, status: "undelivered", statusAt: at }
}

/** Whether an own message is still waiting to be sent again. */
export function awaitsResend(message: SendState): boolean {
    return message.status === "failed" || (message.status === "undelivered" && !message.resent)
}

/** The fields a route needs to name a row of the conversation list. */
export interface ConversationRef {
    id: string
    kind: "dm" | "group"
    /** For a group, its first other member's address. */
    address: string
}

/**
 * The conversation a route param names: a conversation id, or a peer's
 * address — which designates the 1:1 with them, never a group. A group also
 * carries a member's address, so matching groups by address would open the
 * group instead of the private conversation.
 */
export function findConversation<T extends ConversationRef>(conversations: T[], ref: string): T | undefined {
    return conversations.find((c) => c.id === ref) ?? conversations.find((c) => c.kind === "dm" && c.address === ref)
}

/**
 * Whether a route ref the list doesn't hold opens a new private conversation: an address does,
 * an id never — a group id is not an address.
 */
export function startsConversation(ref: string): boolean {
    const { handle, host } = addressParts(ref)
    return handle !== "" && host !== ""
}
