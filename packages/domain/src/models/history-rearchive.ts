/**
 * Re-making the history archive from this device's own copy, once its words were replaced
 * (`identity-provider/specs/e2ee.md § 3.8`): which cached messages become which entries, in which
 * order, how far a run got, and when it is due.
 */

import { canonicalId } from "./approval-handshake"
import { UNDECRYPTABLE_TEXT, type Attachment, type Decryption, type SendStatus } from "./dm"
import type { AttachmentBlobKey, TextBody } from "./e2ee"
import {
    ARCHIVE_UPLOAD_LIMIT,
    archivedReactionSnapshot,
    archivedText,
    type ArchiveEnvelope,
    type SnapshotReaction,
} from "./history-archive"
import { dueRestore, isGeneration, savesToArchive, type HistoryKeyStanding } from "./history-key"
import { IdpError, isApprovalRequired, isStaleHistoryKey, isUnreachable } from "./idp-error"

/** A cached message as the re-archive reads it: the web's `Message` has this shape. */
export interface CachedMessage extends Decryption {
    id: string
    author: string
    authorAddress?: string
    content: string
    createdAt: string
    status?: SendStatus
    edited?: boolean
    reactions?: ReadonlyArray<{ emoji: string; count: number; reacted: boolean }>
    replyTo?: { id: string; content: string; author: string }
    attachments?: Attachment[]
    attachmentKeys?: Record<string, AttachmentBlobKey>
}

/** Where an entry stands in a re-archive: its conversation, its message's instant and id, its part — the text 0, its reactions 1. */
export interface RearchivePosition {
    conversationId: string
    at: number
    messageId: string
    part: number
}

/** A re-archive due under `generation`; `cursor` the last entry the IdP took, `null` before any. */
export interface RearchiveDue {
    generation: number
    cursor: RearchivePosition | null
}

export interface RearchiveEntry {
    conversationId: string
    /** A text's is its message's id; a reaction snapshot's is keyed by the history key, the engine's to compute. */
    id: string | { reactionsOf: string }
    envelope: ArchiveEnvelope
    position: RearchivePosition
    /** Its message's last entry: the message is re-saved once this one is. */
    closesMessage: boolean
}

export function comparePositions(a: RearchivePosition, b: RearchivePosition): number {
    if (a.conversationId !== b.conversationId) return a.conversationId < b.conversationId ? -1 : 1
    if (a.at !== b.at) return a.at - b.at
    if (a.messageId !== b.messageId) return a.messageId < b.messageId ? -1 : 1
    return a.part - b.part
}

function timeOf(iso: string): number {
    const at = Date.parse(iso)
    return Number.isNaN(at) ? 0 : at
}

// Failed and unsent copies were never stored by the IdP; a placeholder holds no text.
function rearchivable(message: CachedMessage): message is CachedMessage & { authorAddress: string } {
    return (
        !message.undecrypted &&
        message.content !== UNDECRYPTABLE_TEXT &&
        message.status !== "failed" &&
        message.status !== "sending" &&
        typeof message.authorAddress === "string" &&
        message.authorAddress.length > 0
    )
}

function textBody(message: CachedMessage): TextBody {
    const body: TextBody = { text: message.content }
    const keys = Object.values(message.attachmentKeys ?? {})
    if (keys.length > 0) body.attachments = keys
    if (message.replyTo) {
        body.reply_meta = {
            target_message_id: message.replyTo.id,
            preview_text: message.replyTo.content,
            preview_sender: message.replyTo.author,
        }
    }
    return body
}

/** The cache's counts as they stand, each emoji once. */
function standingReactions(message: CachedMessage): SnapshotReaction[] {
    const reactions: SnapshotReaction[] = []
    for (const { emoji, count, reacted } of message.reactions ?? []) {
        if (!Number.isSafeInteger(count) || count < 1 || reactions.some((r) => r.emoji === emoji)) continue
        reactions.push({ emoji, count, reacted: reacted === true })
    }
    return reactions
}

/** The cache's conversations in the order a re-archive goes through them: by id. */
export function rearchiveConversations(
    conversations: Readonly<Record<string, readonly CachedMessage[]>>,
): Array<{ conversationId: string; key: string }> {
    return Object.keys(conversations)
        .flatMap((key) => {
            const conversationId = canonicalId(key)
            return conversationId ? [{ conversationId, key }] : []
        })
        .sort((a, b) => (a.conversationId < b.conversationId ? -1 : a.conversationId > b.conversationId ? 1 : 0))
}

/** A conversation's messages to re-archive, by instant then id, a message id met twice once. */
function heldMessages(messages: readonly CachedMessage[]) {
    const held = new Map<string, { id: string; at: number; message: CachedMessage & { authorAddress: string } }>()
    for (const message of messages) {
        const id = canonicalId(message.id)
        if (id && !held.has(id) && rearchivable(message)) held.set(id, { id, at: timeOf(message.createdAt), message })
    }
    return [...held.values()].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * One conversation's entries: each message's text — its latest, marked edited, its attachments'
 * keys and its reply with it — then, when it has any, its reactions as the cache counts them at
 * `asOf` (`reacted` the user's own: the cache names no other reactor). `me` is the account's address.
 */
export function conversationEntries(
    conversationId: string,
    messages: readonly CachedMessage[],
    me: string,
    asOf: string,
): RearchiveEntry[] {
    return heldMessages(messages).flatMap(({ id, at, message }) => {
        const text: RearchiveEntry = {
            conversationId,
            id,
            envelope: archivedText(
                { address: message.authorAddress, displayName: message.author },
                message.createdAt,
                textBody(message),
                message.attachments,
                message.edited === true,
            ),
            position: { conversationId, at, messageId: id, part: 0 },
            closesMessage: true,
        }
        const reactions = standingReactions(message)
        if (reactions.length === 0) return [text]
        const snapshot: RearchiveEntry = {
            conversationId,
            id: { reactionsOf: id },
            envelope: archivedReactionSnapshot({ address: me }, { target_message_id: id, as_of: asOf, reactions }),
            position: { conversationId, at, messageId: id, part: 1 },
            closesMessage: true,
        }
        return [{ ...text, closesMessage: false }, snapshot]
    })
}

export function remainingAfter(entries: readonly RearchiveEntry[], cursor: RearchivePosition | null): RearchiveEntry[] {
    return cursor ? entries.filter((entry) => comparePositions(entry.position, cursor) > 0) : [...entries]
}

/** In messages, counted without building an entry: those wholly at or before the cursor, of all to re-archive. */
export function rearchiveProgress(
    conversations: Readonly<Record<string, readonly CachedMessage[]>>,
    cursor: RearchivePosition | null,
): { done: number; total: number } {
    let done = 0
    let total = 0
    for (const { conversationId, key } of rearchiveConversations(conversations)) {
        for (const { id, at, message } of heldMessages(conversations[key])) {
            total += 1
            const last = { conversationId, at, messageId: id, part: standingReactions(message).length > 0 ? 1 : 0 }
            if (cursor && comparePositions(last, cursor) <= 0) done += 1
        }
    }
    return { done, total }
}

/** In order, one conversation a batch: the IdP refuses a batch whole for one conversation it won't take. */
export function rearchiveBatches(entries: readonly RearchiveEntry[]): RearchiveEntry[][] {
    const batches: RearchiveEntry[][] = []
    for (const entry of entries) {
        const last = batches[batches.length - 1]
        if (last && last.length < ARCHIVE_UPLOAD_LIMIT && last[0].conversationId === entry.conversationId) last.push(entry)
        else batches.push([entry])
    }
    return batches
}

/**
 * The restore's rule, and saving's: run while the device holds `due`, approved under it
 * (`savesToArchive`) — `unapproved` until it is —; moot once a later generation is in force, which
 * erased the archive.
 */
export function dueRearchive(due: number, standing: HistoryKeyStanding): "rearchive" | "abandon" | "unapproved" | "wait" {
    const verdict = dueRestore(due, standing)
    if (verdict === "moot") return "abandon"
    if (verdict === "wait") return "wait"
    return savesToArchive(standing) ? "rearchive" : "unapproved"
}

/**
 * What a refused batch means: `retry` after a pause (no answer, `5xx`, `429`, `408`), `stale` (the
 * key read again), `wait` (`approval_required`: the instance doesn't count this device approved
 * yet — the run pauses at its cursor), `skip` (refused for good: sending it again changes nothing),
 * `stop` (anything else — a `401` the renewal didn't cure —: the next start goes on from the cursor).
 */
export type RearchiveRefusal = "retry" | "stale" | "wait" | "skip" | "stop"

export function rearchiveRefusal(error: unknown): RearchiveRefusal {
    if (isStaleHistoryKey(error)) return "stale"
    if (isApprovalRequired(error)) return "wait"
    if (isUnreachable(error)) return "retry"
    if (!(error instanceof IdpError)) return "stop"
    if (error.status === 429 || error.status === 408) return "retry"
    if (error.status === 401) return "stop"
    return error.status >= 400 && error.status < 500 ? "skip" : "stop"
}

/** The pause before each new try of one batch; past the last, the run stops for this page load. */
export const REARCHIVE_RETRY_DELAYS_MS: readonly number[] = [2_000, 5_000, 15_000, 30_000, 60_000]

/** Between two batches: one request at a time, the page given back between them. */
export const REARCHIVE_PACE_MS = 100

/** A row as it was recorded; `null` for anything else. */
export function parseRearchiveDue(value: unknown): RearchiveDue | null {
    if (typeof value !== "object" || value === null) return null
    const row = value as Record<string, unknown>
    if (!isGeneration(row.generation)) return null
    if (row.cursor === null) return { generation: row.generation, cursor: null }
    if (typeof row.cursor !== "object" || row.cursor === null) return null
    const cursor = row.cursor as Record<string, unknown>
    const conversationId = canonicalId(cursor.conversationId)
    const messageId = canonicalId(cursor.messageId)
    if (!conversationId || !messageId || typeof cursor.at !== "number" || !Number.isFinite(cursor.at)) return null
    if (typeof cursor.part !== "number" || !Number.isSafeInteger(cursor.part) || cursor.part < 0) return null
    return { generation: row.generation, cursor: { conversationId, at: cursor.at, messageId, part: cursor.part } }
}
