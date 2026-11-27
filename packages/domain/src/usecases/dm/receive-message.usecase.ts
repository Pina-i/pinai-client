import { base64Bytes } from "../../models/bytes"
import { UNDECRYPTABLE_TEXT, addToTimeline, applyFederationStatus, reconcileSent, settleByEcho } from "../../models/dm"
import type { ApplicationMessage, ReactionBody, TextBody } from "../../models/e2ee"
import { archivedEdit, archivedReaction, archivedText } from "../../models/history-archive"
import { isHeldHere } from "../../models/own-messages"
import { foldReaction } from "../../models/reaction"
import { editOf, pushWire, receivedMessage, type WireMessage } from "../../models/received-message"
import type { DmDeliveryFailedPayload, DmEventPayload, MessageEditedPayload } from "../../models/ws"
import type { CachedTimelineMessage, ConversationTimeline, IConversationCache } from "../../ports/conversation-cache.port"
import type { IE2eePort } from "../../ports/e2ee.port"

export interface ReceiveContext {
    /** The user's: their account's own messages are told apart by it. */
    myAddress: string | undefined
    /** A decrypt one epoch ahead fetches the commits it missed with it. */
    catchUp?: { idpUrl: string; accessToken: string }
}

export interface ReceiveDeps<M> {
    e2ee: Pick<IE2eePort, "decryptInbound" | "bufferForArchive" | "bufferEditForArchive">
    cache: IConversationCache<M>
}

/**
 * What a `new_dm` came to, for what the platform decides itself: the ping, the unread count, the read marker.
 * `mine`: sent from another of the user's devices.
 */
export type DmArrival =
    | { kind: "message"; senderAddress: string; mine: boolean }
    | { kind: "reaction" }
    | { kind: "echo" }
    | { kind: "nothing" }

/** A `new_dm` push: decrypted once, stored, archived. */
export async function receiveMessageUseCase<M extends CachedTimelineMessage>(
    push: DmEventPayload,
    context: ReceiveContext,
    deps: ReceiveDeps<M>,
): Promise<DmArrival> {
    const conversationId = push.conversation_id
    const wire = pushWire(push, context.myAddress)
    const held = await deps.cache.read(conversationId)
    // The IdP fans a message out to every session of its sender's account: one held here is this device's echo, never
    // decrypted — MLS can't, and the try would cost a catch-up.
    const ids = { messageId: push.message_id, clientId: push.client_id }
    if (wire.mine && isHeldHere(held.messages, ids, held.appliedReactionIds)) {
        const at = new Date().toISOString()
        if (push.client_id) await confirmSent(push, push.client_id, wire, held, at, deps)
        else await deps.cache.update(conversationId, (t) => withMessage(t, push.message_id, (m) => settleByEcho(m, at)))
        return { kind: "echo" }
    }

    const app = await decrypted(deps.e2ee, conversationId, base64Bytes(push.mls_ciphertext), context.catchUp)
    const received = receivedMessage(wire, app, "live")
    if (received.kind === "nothing") return { kind: "nothing" }
    if (received.kind === "reaction") {
        await deps.cache.update(conversationId, (t) => {
            const folded = foldReaction(t.messages, t.appliedReactionIds, received.reaction, received.mine)
            if (!folded) return t
            return { ...t, messages: folded.messages ?? t.messages, appliedReactionIds: folded.appliedReactionIds }
        })
        deps.e2ee.bufferForArchive(
            conversationId,
            push.message_id,
            archivedReaction(
                { address: wire.senderAddress, displayName: push.sender_display_name },
                push.created_at,
                app?.body as ReactionBody,
            ),
        )
        return { kind: "reaction" }
    }

    const message = deps.cache.toCached(received.message)
    await deps.cache.update(conversationId, (t) => withMessages(t, addToTimeline(t.messages, message)))
    if (app?.kind === "text") {
        deps.e2ee.bufferForArchive(
            conversationId,
            push.message_id,
            archivedText(
                { address: wire.senderAddress, displayName: wire.senderName },
                push.created_at,
                app.body as TextBody,
                push.attachments,
            ),
        )
    }
    return { kind: "message", senderAddress: wire.senderAddress, mine: wire.mine }
}

// The echo can beat the send's answer: its optimistic copy, whose text only this device holds, becomes the sent one.
async function confirmSent<M extends CachedTimelineMessage>(
    push: DmEventPayload,
    clientId: string,
    wire: WireMessage,
    held: ConversationTimeline<M>,
    at: string,
    deps: ReceiveDeps<M>,
): Promise<void> {
    const optimistic = held.messages.find((m) => m.id === clientId)
    const confirmed = deps.cache.toCached({
        id: push.message_id,
        author: wire.senderName,
        authorAddress: wire.senderAddress,
        content: optimistic?.content ?? UNDECRYPTABLE_TEXT,
        createdAt: push.created_at,
        attachments: push.attachments,
        status: "sent",
        statusAt: at,
        ...(optimistic?.replyTo ? { replyTo: optimistic.replyTo } : {}),
        ...(optimistic?.attachmentKeys ? { attachmentKeys: optimistic.attachmentKeys } : {}),
    })
    await deps.cache.update(push.conversation_id, (t) => withMessages(t, reconcileSent(t.messages, clientId, confirmed)))
    // The send's answer archives it too; this covers an answer that never came.
    if (!optimistic) return
    const body: TextBody = { text: optimistic.content }
    if (optimistic.replyTo) {
        body.reply_meta = {
            target_message_id: optimistic.replyTo.id,
            preview_text: optimistic.replyTo.content,
            preview_sender: optimistic.replyTo.author,
        }
    }
    if (optimistic.attachmentKeys) body.attachments = Object.values(optimistic.attachmentKeys)
    deps.e2ee.bufferForArchive(
        push.conversation_id,
        push.message_id,
        archivedText({ address: wire.senderAddress, displayName: wire.senderName }, push.created_at, body, push.attachments),
    )
}

/**
 * A `message_edited` push, which names no conversation: tried in each held one until one decrypts it as an edit of
 * that message. One that doesn't decrypt still marks a peer's message edited, its text the placeholder.
 */
export async function receiveEditUseCase<M extends CachedTimelineMessage>(
    edit: MessageEditedPayload,
    context: ReceiveContext,
    deps: ReceiveDeps<M>,
): Promise<void> {
    const ciphertext = base64Bytes(edit.new_mls_ciphertext)
    let text: string | null = null
    for (const conversationId of await deps.cache.conversationIds()) {
        text = editOf(await decrypted(deps.e2ee, conversationId, ciphertext, context.catchUp), edit.message_id)
        if (text === null) continue
        const target = (await deps.cache.read(conversationId)).messages.find((m) => m.id === edit.message_id)
        if (ciphertext && target?.authorAddress) {
            deps.e2ee.bufferEditForArchive(
                conversationId,
                ciphertext,
                archivedEdit({ address: target.authorAddress, displayName: target.author }, edit.edited_at, {
                    target_message_id: edit.message_id,
                    new_text: text,
                }),
            )
        }
        break
    }
    const held = await whereHeld(deps.cache, edit.message_id)
    if (!held) return
    // One of the user's own that doesn't decrypt is this device's edit, applied when it was made.
    if (text === null && held.message.authorAddress === context.myAddress) return
    // Its time kept: history tries only a later edit again.
    const read = text === null ? { content: UNDECRYPTABLE_TEXT } : { content: text, editedAt: edit.edited_at }
    await deps.cache.update(held.conversationId, (t) =>
        withMessage(t, edit.message_id, (m) => ({ ...m, ...read, edited: true })),
    )
}

/** A `dm_delivery_failed` push: the IdP never retries, so the message offers sending it again. */
export async function receiveDeliveryFailureUseCase<M extends CachedTimelineMessage>(
    failure: DmDeliveryFailedPayload,
    cache: IConversationCache<M>,
    at = new Date().toISOString(),
): Promise<void> {
    const held = await whereHeld(cache, failure.message_id)
    if (!held) return
    await cache.update(held.conversationId, (t) =>
        withMessage(t, failure.message_id, (m) => applyFederationStatus(m, "failed", at)),
    )
}

// Any failure — no group, an MLS error, a body that isn't JSON — is a message that didn't decrypt.
export async function decrypted(
    e2ee: Pick<IE2eePort, "decryptInbound">,
    conversationId: string,
    ciphertext: Uint8Array | null,
    catchUp: ReceiveContext["catchUp"],
): Promise<ApplicationMessage | null> {
    if (!ciphertext) return null
    try {
        return await e2ee.decryptInbound(conversationId, ciphertext, catchUp)
    } catch {
        return null
    }
}

// The first conversation holding the message: a push naming none is looked for everywhere.
async function whereHeld<M extends { id: string }>(
    cache: IConversationCache<M>,
    messageId: string,
): Promise<{ conversationId: string; message: M } | null> {
    for (const conversationId of await cache.conversationIds()) {
        const message = (await cache.read(conversationId)).messages.find((m) => m.id === messageId)
        if (message) return { conversationId, message }
    }
    return null
}

export function withMessages<M>(timeline: ConversationTimeline<M>, messages: M[]): ConversationTimeline<M> {
    return messages === timeline.messages ? timeline : { ...timeline, messages }
}

export function withMessage<M extends { id: string }>(
    timeline: ConversationTimeline<M>,
    messageId: string,
    change: (message: M) => M,
): ConversationTimeline<M> {
    const at = timeline.messages.findIndex((m) => m.id === messageId)
    if (at === -1) return timeline
    const changed = change(timeline.messages[at])
    if (changed === timeline.messages[at]) return timeline
    const messages = [...timeline.messages]
    messages[at] = changed
    return withMessages(timeline, messages)
}
