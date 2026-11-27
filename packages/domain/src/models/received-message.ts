import type { UserProfile } from "./auth"
import { UNDECRYPTABLE_TEXT, type Attachment, type Decryption, type DirectMessage } from "./dm"
import type { ApplicationMessage, AttachmentBlobKey, EditBody, ReactionBody, TextBody } from "./e2ee"
import { actorUriToAddress } from "./identity"
import type { ReactionApplication } from "./reaction"
import type { DmEventPayload } from "./ws"

/** What a history row and a live push both say of a message, outside its ciphertext. */
export interface WireMessage {
    id: string
    senderAddress: string
    senderName: string
    /** Sent from the user's account: this device or another of theirs. */
    mine: boolean
    createdAt: string
    replyToId?: string | null
    attachments?: Attachment[]
    /** A history row's only: whether the IdP marks it edited. */
    edited?: boolean
    /** A history row's only: when it was last edited. */
    editedAt?: string
}

/** A message as a timeline keeps it: what every client's own message shape carries, how it looks left to each. */
export interface ReceivedText extends Decryption {
    id: string
    author: string
    authorAddress: string
    content: string
    createdAt: string
    edited?: boolean
    /** When the last edit this device read was made: history tries a later one. */
    editedAt?: string
    attachments?: Attachment[]
    attachmentKeys?: Record<string, AttachmentBlobKey>
    replyTo?: { id: string; content: string; author: string }
}

/**
 * What a message from history or the socket becomes. `edit`: history's row of an edited message, whose
 * ciphertext is the edit's — shown with the edit's text, marked `editOnly` until a fuller copy (the archive's) comes.
 */
export type ReceivedMessage =
    | { kind: "message"; message: ReceivedText }
    | { kind: "edit"; message: ReceivedText }
    | { kind: "reaction"; reaction: ReactionApplication; mine: boolean }
    | { kind: "nothing" }

// The handle stands in for a name only when the IdP has none.
function nameOf(displayName: string | null, address: string): string {
    return displayName ?? address.split("@")[0]
}

export function historyWire(
    row: DirectMessage,
    me: Pick<UserProfile, "address" | "display_name" | "preferred_username">,
): WireMessage {
    const senderAddress = actorUriToAddress(row.sender_actor_uri)
    const mine = senderAddress === me.address
    return {
        id: row.id,
        senderAddress,
        senderName: mine ? (me.display_name ?? me.preferred_username) : nameOf(row.sender_display_name, senderAddress),
        mine,
        createdAt: row.created_at,
        replyToId: row.reply_to_id,
        attachments: row.attachments,
        edited: row.edited_at != null,
        ...(row.edited_at != null && { editedAt: row.edited_at }),
    }
}

export function pushWire(push: DmEventPayload, myAddress: string | undefined): WireMessage {
    const senderAddress = actorUriToAddress(push.sender_address)
    return {
        id: push.message_id,
        senderAddress,
        senderName: nameOf(push.sender_display_name, senderAddress),
        mine: senderAddress === myAddress,
        createdAt: push.created_at,
        replyToId: push.reply_to_id,
        attachments: push.attachments,
    }
}

/**
 * A message from history or the socket once its ciphertext was tried (`app` null: it didn't decrypt).
 * One from history that doesn't decrypt predates this device in the group — only the archive brings it
 * back —, and one of the account's own is this device's (MLS never decrypts it) or older than it: nothing.
 * Any other live one shows as a placeholder, tried again by history.
 */
export function receivedMessage(
    wire: WireMessage,
    app: ApplicationMessage | null,
    source: "history" | "live",
): ReceivedMessage {
    if (!app) {
        if (source === "history" || wire.mine) return { kind: "nothing" }
        return { kind: "message", message: timelineText(wire, null, true) }
    }
    if (app.kind === "reaction") {
        const body = app.body as ReactionBody
        if (
            body &&
            typeof body.target_message_id === "string" &&
            typeof body.emoji === "string" &&
            (body.op === "add" || body.op === "remove")
        ) {
            const reaction: ReactionApplication = {
                reaction_message_id: wire.id,
                target_message_id: body.target_message_id,
                reactor_address: wire.senderAddress,
                emoji: body.emoji,
                op: body.op,
            }
            return { kind: "reaction", reaction, mine: wire.mine }
        }
        return { kind: "nothing" }
    }
    if (app.kind === "edit") {
        const text = editOf(app, wire.id)
        const message = timelineText(wire, text === null ? null : { text }, false)
        return {
            kind: "edit",
            message: { ...message, edited: true, editOnly: true, ...(wire.editedAt !== undefined && { editedAt: wire.editedAt }) },
        }
    }
    return { kind: "message", message: timelineText(wire, app.kind === "text" ? (app.body as TextBody) : null, false) }
}

/** The text an edit of message `messageId` gives it; `null` for anything else. */
export function editOf(app: ApplicationMessage | null, messageId: string): string | null {
    if (app?.kind !== "edit") return null
    const body = app.body as EditBody
    return body?.target_message_id === messageId && typeof body.new_text === "string" ? body.new_text : null
}

/**
 * Whether a held copy may miss the edit history's row carries (`editedAt`, the row's): edited after the last edit read
 * here. An edited copy whose edit's time isn't known — restored, or edited on this device — counts as current: its row
 * would only fail to decrypt again at each opening.
 */
export function editedSince(held: { edited?: boolean; editedAt?: string }, editedAt: string | null): boolean {
    if (editedAt === null) return false
    if (held.editedAt === undefined) return !held.edited
    return Date.parse(editedAt) > Date.parse(held.editedAt)
}

// A body of another kind, or a text body without its text, leaves the placeholder.
function timelineText(wire: WireMessage, body: TextBody | null | undefined, undecrypted: boolean): ReceivedText {
    let content = UNDECRYPTABLE_TEXT
    let replyMeta: { content: string; author: string } | null = null
    let attachmentKeys: Record<string, AttachmentBlobKey> | undefined
    if (typeof body?.text === "string") content = body.text
    if (
        body?.reply_meta &&
        typeof body.reply_meta.preview_text === "string" &&
        typeof body.reply_meta.preview_sender === "string"
    ) {
        replyMeta = { content: body.reply_meta.preview_text, author: body.reply_meta.preview_sender }
    }
    if (Array.isArray(body?.attachments) && body.attachments.length > 0) {
        attachmentKeys = {}
        for (const k of body.attachments) attachmentKeys[k.id] = k
    }
    const message: ReceivedText = {
        id: wire.id,
        author: wire.senderName,
        authorAddress: wire.senderAddress,
        content,
        createdAt: wire.createdAt,
        ...(wire.edited !== undefined && { edited: wire.edited }),
        attachments: wire.attachments,
        attachmentKeys,
        ...(undecrypted && { undecrypted: true as const }),
    }
    // Without a decrypted preview the reply shows as a slim "replied" hint.
    if (wire.replyToId) {
        message.replyTo = { id: wire.replyToId, content: replyMeta?.content ?? "", author: replyMeta?.author ?? "" }
    }
    return message
}
