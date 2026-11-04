import type { Attachment, Decryption } from "./dm"
import type { ApplicationMessage, AttachmentBlobKey, EditBody, ReactionBody, TextBody } from "./e2ee"

/** The most entries `POST /api/history/messages` takes at once. */
export const ARCHIVE_UPLOAD_LIMIT = 50

/** The most entries waiting for the archive on a device; past it, the oldest go. */
export const ARCHIVE_BUFFER_LIMIT = 1000

/**
 * An edit's entry id: its MLS ciphertext's digest as a version-8 UUID. Every device and every
 * path that meets the edit — the sender's own, the live push, a history load — holds the same
 * bytes, so the edit is archived once.
 */
export function editEntryId(ciphertextDigest: Uint8Array): string {
    if (ciphertextDigest.length < 16) throw new Error("An edit's digest is at least 16 bytes")
    const bytes = ciphertextDigest.slice(0, 16)
    bytes[6] = (bytes[6] & 0x0f) | 0x80
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * An entry of the history archive before it is sealed under the History Archive Key: a message,
 * an edit or a reaction, with what restoring it needs that the MLS body doesn't carry.
 */
export interface ArchiveEnvelope {
    v: 1
    sender_address: string
    sender_display_name?: string
    /** ISO 8601: the message's `created_at`, an edit's `edited_at`, a reaction's `created_at`. */
    created_at: string
    app: ApplicationMessage
    /** A message's attachments as the IdP lists them; their keys travel in `app`. */
    attachments?: Attachment[]
}

export interface ArchiveSender {
    address: string
    displayName?: string | null
}

export interface ArchivedEntry {
    conversationId: string
    id: string
    envelope: ArchiveEnvelope
}

/** A reaction the archive says is still on its message: the last its reactor did with that emoji. */
export interface RestoredReaction {
    /** The reaction's own message id. */
    id: string
    emoji: string
    reactorAddress: string
}

/** A message as the archive gives it back, its latest edit applied. */
export interface RestoredMessage {
    conversationId: string
    id: string
    senderAddress: string
    senderDisplayName: string | null
    createdAt: string
    text: string
    edited: boolean
    replyTo?: { id: string; content: string; author: string }
    attachments: Attachment[]
    attachmentKeys: AttachmentBlobKey[]
    /** Oldest first. */
    reactions: RestoredReaction[]
}

function envelope(sender: ArchiveSender, at: string, app: ApplicationMessage): ArchiveEnvelope {
    return {
        v: 1,
        sender_address: sender.address,
        ...(sender.displayName ? { sender_display_name: sender.displayName } : {}),
        created_at: at,
        app,
    }
}

export function archivedText(
    sender: ArchiveSender,
    createdAt: string,
    body: TextBody,
    attachments: Attachment[] | undefined,
): ArchiveEnvelope {
    const entry = envelope(sender, createdAt, { version: 1, kind: "text", body })
    return attachments?.length ? { ...entry, attachments } : entry
}

/** `sender` is the edited message's: only its sender edits a message. */
export function archivedEdit(sender: ArchiveSender, editedAt: string, body: EditBody): ArchiveEnvelope {
    return envelope(sender, editedAt, { version: 1, kind: "edit", body })
}

/** `sender` is the reactor; a removal is archived too, or a removed reaction would come back. */
export function archivedReaction(sender: ArchiveSender, createdAt: string, body: ReactionBody): ArchiveEnvelope {
    return envelope(sender, createdAt, { version: 1, kind: "reaction", body })
}

// Attachment keys are bytes, which JSON writes as an object of indices.
export function encodeArchiveEnvelope(entry: ArchiveEnvelope): string {
    return JSON.stringify(entry, (_key, value: unknown) =>
        value instanceof Uint8Array ? { $bytes: Array.from(value) } : value,
    )
}

function isByteList(value: unknown): value is number[] {
    return Array.isArray(value) && value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** `null` for anything that isn't an entry this client writes. */
export function decodeArchiveEnvelope(json: string): ArchiveEnvelope | null {
    let value: unknown
    try {
        value = JSON.parse(json, (_key, v: unknown) =>
            isRecord(v) && isByteList(v.$bytes) && Object.keys(v).length === 1 ? Uint8Array.from(v.$bytes) : v,
        )
    } catch {
        return null
    }
    if (!isRecord(value) || value.v !== 1) return null
    if (typeof value.sender_address !== "string" || typeof value.created_at !== "string") return null
    const app = value.app
    if (!isRecord(app) || typeof app.kind !== "string" || !isRecord(app.body)) return null
    if (value.attachments !== undefined && !Array.isArray(value.attachments)) return null
    return value as unknown as ArchiveEnvelope
}

function timeOf(iso: string): number {
    const at = Date.parse(iso)
    return Number.isNaN(at) ? 0 : at
}

function restoredText(entry: ArchivedEntry): RestoredMessage {
    const { envelope: archived } = entry
    const body = archived.app.body as Partial<TextBody>
    const reply = body.reply_meta
    return {
        conversationId: entry.conversationId,
        id: entry.id,
        senderAddress: archived.sender_address,
        senderDisplayName: archived.sender_display_name ?? null,
        createdAt: archived.created_at,
        text: typeof body.text === "string" ? body.text : "",
        edited: false,
        ...(reply &&
        typeof reply.target_message_id === "string" &&
        typeof reply.preview_text === "string" &&
        typeof reply.preview_sender === "string"
            ? {
                  replyTo: {
                      id: reply.target_message_id,
                      content: reply.preview_text,
                      author: reply.preview_sender,
                  },
              }
            : {}),
        attachments: archived.attachments ?? [],
        attachmentKeys: Array.isArray(body.attachments) ? body.attachments : [],
        reactions: [],
    }
}

function isReaction(body: Partial<ReactionBody>): body is ReactionBody {
    return (
        typeof body.target_message_id === "string" &&
        typeof body.emoji === "string" &&
        (body.op === "add" || body.op === "remove")
    )
}

/** Per message, the last thing each reactor did with each emoji, kept when it was an add. */
function restoredReactions(entries: readonly ArchivedEntry[], messages: ReadonlyMap<string, RestoredMessage>) {
    const last = new Map<string, { entry: ArchivedEntry; body: ReactionBody }>()
    for (const entry of entries) {
        const body = entry.envelope.app.body as Partial<ReactionBody>
        if (!isReaction(body)) continue
        const target = messages.get(body.target_message_id)
        if (!target || target.conversationId !== entry.conversationId) continue
        const key = JSON.stringify([body.target_message_id, entry.envelope.sender_address, body.emoji])
        last.set(key, { entry, body })
    }
    const byMessage = new Map<string, RestoredReaction[]>()
    for (const { entry, body } of last.values()) {
        if (body.op !== "add") continue
        const list = byMessage.get(body.target_message_id) ?? []
        list.push({ id: entry.id, emoji: body.emoji, reactorAddress: entry.envelope.sender_address })
        byMessage.set(body.target_message_id, list)
    }
    return byMessage
}

/**
 * The archive as messages, oldest first: each text once, with the latest of its sender's edits
 * applied and the reactions still on it. An edit or a reaction whose message isn't in the archive
 * is dropped.
 */
export function restoredMessages(entries: readonly ArchivedEntry[]): RestoredMessage[] {
    const messages = new Map<string, RestoredMessage>()
    const edits: ArchivedEntry[] = []
    const reactions: ArchivedEntry[] = []
    for (const entry of entries) {
        const { kind } = entry.envelope.app
        if (kind === "text" && !messages.has(entry.id)) messages.set(entry.id, restoredText(entry))
        else if (kind === "edit") edits.push(entry)
        else if (kind === "reaction") reactions.push(entry)
    }
    const byTime = (a: ArchivedEntry, b: ArchivedEntry) => timeOf(a.envelope.created_at) - timeOf(b.envelope.created_at)
    edits.sort(byTime)
    reactions.sort(byTime)
    for (const edit of edits) {
        const body = edit.envelope.app.body as Partial<EditBody>
        if (typeof body.target_message_id !== "string" || typeof body.new_text !== "string") continue
        const target = messages.get(body.target_message_id)
        if (
            !target ||
            target.conversationId !== edit.conversationId ||
            target.senderAddress !== edit.envelope.sender_address
        ) {
            continue
        }
        messages.set(target.id, { ...target, text: body.new_text, edited: true })
    }
    for (const [id, list] of restoredReactions(reactions, messages)) {
        const target = messages.get(id)
        if (target) messages.set(id, { ...target, reactions: list })
    }
    return [...messages.values()].sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt))
}

/**
 * The restored reactions to apply to a conversation: those of the messages the cache doesn't hold
 * decrypted. A held copy wins, reactions included, as it does over its history copy.
 */
export function reactionsToReplay(
    cached: readonly ({ id: string } & Decryption)[],
    restored: readonly RestoredMessage[],
): Array<{ messageId: string; reaction: RestoredReaction }> {
    const held = new Set(cached.filter((m) => !m.undecrypted).map((m) => m.id))
    return restored
        .filter((m) => !held.has(m.id))
        .flatMap((m) => m.reactions.map((reaction) => ({ messageId: m.id, reaction })))
}
