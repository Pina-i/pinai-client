import { bytesBase64 } from "../../models/bytes"
import { addToTimeline, canResend, reconcileSent, settleStaleSend, type DirectMessage } from "../../models/dm"
import type { ActorUri, AttachmentBlobKey, ConversationId, TextBody } from "../../models/e2ee"
import { archivedText } from "../../models/history-archive"
import type { CachedTimelineMessage, IConversationCache } from "../../ports/conversation-cache.port"
import type { IDmPort } from "../../ports/dm.port"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { IGroupPort } from "../../ports/group.port"
import { enterConversationUseCase, type ConversationJoins, type JoinContext } from "../e2ee/join-conversations.usecase"
import { withMessage, withMessages } from "./receive-message.usecase"

/** Where a message goes: a DM to its other member, a group to all of them. */
export interface SendRoute {
    conversationId: ConversationId
    kind: "dm" | "group"
    /** The DM's other member, `POST /api/dm`'s recipient. */
    recipientAddress: string
    /** The DM's other member, with whom its first message founds its group; `null` for a group. */
    recipientActorUri: ActorUri | null
}

/** A text to send, a reply's preview with it; each attachment key's id is its attachment's. */
export interface SendIntent extends SendRoute {
    content: string
    replyTo: { id: string; content: string; author: string } | null
    attachmentIds: string[]
    attachmentKeys: AttachmentBlobKey[]
    /** The undelivered message this one sends again. */
    resentFrom?: string
}

export interface SendContext extends JoinContext {
    /** The user, as their own messages name them. */
    me: { address: string; name: string }
}

export interface MessageSendsDeps<M> {
    e2ee: Pick<IE2eePort, "encryptOutbound" | "bufferForArchive" | "ensureGroupExists">
    dm: Pick<IDmPort, "sendMessage">
    group: Pick<IGroupPort, "sendGroupMessage">
    cache: IConversationCache<M>
    joins: Pick<ConversationJoins, "whenIn">
    /** A new message's own id: its `clientId` until the IdP gives it one. */
    newId: () => string
    /** A send that failed, by the stage it failed at. */
    report?: (stage: string, error: unknown) => void
}

/** What a retry did: `resent`, a new message for an undelivered one; `retried`, a failed one sent again in place. */
export type RetryOutcome = "resent" | "retried" | "nothing"

/**
 * The page load's sends. A message is shown at once, `sending`, then the device enters the conversation (a Welcome
 * or its own join waited for, a DM's group founded), encrypts, posts, and the IdP's copy takes its place, archived.
 * Anything failing leaves it `failed`, offering a retry. A send this page load still works on is never failed as stale.
 */
export class MessageSends<M extends CachedTimelineMessage> {
    private readonly deps: MessageSendsDeps<M>
    private readonly underWay = new Set<string>()
    // Each unsent message's intent, by its id; a retry without one rebuilds it from the message.
    private readonly intents = new Map<string, SendIntent>()

    constructor(deps: MessageSendsDeps<M>) {
        this.deps = deps
    }

    async send(intent: SendIntent, context: SendContext): Promise<void> {
        const id = this.deps.newId()
        const at = new Date().toISOString()
        const optimistic = this.deps.cache.toCached({
            id,
            author: context.me.name,
            authorAddress: context.me.address,
            content: intent.content,
            createdAt: at,
            status: "sending",
            statusAt: at,
            ...(intent.attachmentKeys.length > 0 ? { attachmentKeys: keyed(intent.attachmentKeys) } : {}),
            ...(intent.replyTo ? { replyTo: { ...intent.replyTo } } : {}),
            ...(intent.resentFrom ? { resentFrom: intent.resentFrom } : {}),
        })
        await this.deps.cache.update(intent.conversationId, (t) => withMessages(t, addToTimeline(t.messages, optimistic)))
        this.intents.set(id, intent)
        await this.deliver(id, intent, context)
    }

    /** A failed message sent again in place; an undelivered one stays as the record of that attempt, sent again as a new one. */
    async retry(route: SendRoute, messageId: string, context: SendContext): Promise<RetryOutcome> {
        const message = (await this.deps.cache.read(route.conversationId)).messages.find((m) => m.id === messageId)
        if (!message) return "nothing"
        if (message.status === "undelivered") {
            const intent = resendIntent(message, route)
            if (!intent) return "nothing"
            await this.deps.cache.update(route.conversationId, (t) => withMessage(t, messageId, (m) => ({ ...m, resent: true })))
            await this.send({ ...intent, resentFrom: messageId }, context)
            return "resent"
        }
        const intent = this.intents.get(messageId) ?? resendIntent(message, route)
        if (!intent) return "nothing"
        this.intents.set(messageId, intent)
        const at = new Date().toISOString()
        await this.deps.cache.update(route.conversationId, (t) =>
            withMessage(t, messageId, (m) => ({ ...m, status: "sending", statusAt: at })),
        )
        await this.deliver(messageId, intent, context)
        return "retried"
    }

    /** A send a closed page left `sending` never settles by itself: opening its conversation fails it, offering a retry. */
    async settleStale(conversationId: string, now = Date.now()): Promise<void> {
        await this.deps.cache.update(conversationId, (t) => {
            const settled = t.messages.map((m) => (this.underWay.has(m.id) ? m : settleStaleSend(m, now)))
            return settled.some((m, i) => m !== t.messages[i]) ? { ...t, messages: settled } : t
        })
    }

    private async deliver(id: string, intent: SendIntent, context: SendContext): Promise<void> {
        const { conversationId } = intent
        if (intent.kind === "dm" && !intent.recipientActorUri) {
            return this.fail(conversationId, id, "enterConversation", new Error("Missing recipient"))
        }
        this.underWay.add(id)
        try {
            await enterConversationUseCase(this.deps.joins, this.deps.e2ee, context, {
                id: conversationId,
                peer: intent.kind === "dm" ? intent.recipientActorUri : null,
            })
        } catch (error) {
            this.underWay.delete(id)
            return this.fail(conversationId, id, "enterConversation", error)
        }
        this.underWay.delete(id)
        const accessToken = context.accessToken()
        if (!accessToken) return this.fail(conversationId, id, "encryptOutbound", new Error("Signed out"))

        // Every check before this line: encrypting advances the sender's MLS counter, and a ciphertext never sent
        // leaves the members' behind it for good.
        const body = textBody(intent)
        let ciphertext: Uint8Array
        try {
            ciphertext = await this.deps.e2ee.encryptOutbound(conversationId, { version: 1, kind: "text", body })
        } catch (error) {
            return this.fail(conversationId, id, "encryptOutbound", error)
        }
        const mlsCiphertext = bytesBase64(ciphertext)
        const attachmentIds = intent.attachmentIds.length > 0 ? intent.attachmentIds : undefined
        let sent: DirectMessage
        if (intent.kind === "group") {
            try {
                sent = await this.deps.group.sendGroupMessage(
                    context.idpUrl,
                    accessToken,
                    conversationId,
                    mlsCiphertext,
                    intent.replyTo?.id,
                    attachmentIds,
                )
            } catch (error) {
                return this.fail(conversationId, id, "POST /api/groups/:id/messages", error)
            }
        } else {
            // Over REST, never the socket: a refusal answers here, where the socket would leave it waiting out its timeout.
            try {
                sent = await this.deps.dm.sendMessage(
                    context.idpUrl,
                    accessToken,
                    intent.recipientAddress,
                    mlsCiphertext,
                    intent.replyTo?.id,
                    attachmentIds,
                    conversationId,
                    id,
                )
            } catch (error) {
                return this.fail(conversationId, id, "POST /api/dm", error)
            }
        }
        await this.confirm(id, intent, body, sent, context)
    }

    private async confirm(id: string, intent: SendIntent, body: TextBody, sent: DirectMessage, context: SendContext): Promise<void> {
        const confirmed = this.deps.cache.toCached({
            id: sent.id,
            author: context.me.name,
            authorAddress: context.me.address,
            content: intent.content,
            createdAt: sent.created_at,
            attachments: sent.attachments,
            status: "sent",
            statusAt: new Date().toISOString(),
            ...(intent.resentFrom ? { resentFrom: intent.resentFrom } : {}),
            ...(intent.attachmentKeys.length > 0 ? { attachmentKeys: keyed(intent.attachmentKeys) } : {}),
            ...(intent.replyTo ? { replyTo: { ...intent.replyTo } } : {}),
        })
        await this.deps.cache.update(intent.conversationId, (t) => withMessages(t, reconcileSent(t.messages, id, confirmed)))
        this.intents.delete(id)
        // Not left to the echo: the answer may beat it, and a group's echo carries no client id.
        this.deps.e2ee.bufferForArchive(
            intent.conversationId,
            sent.id,
            archivedText({ address: context.me.address, displayName: context.me.name }, sent.created_at, body, sent.attachments),
        )
    }

    private async fail(conversationId: string, id: string, stage: string, error: unknown): Promise<void> {
        this.deps.report?.(stage, error)
        const at = new Date().toISOString()
        await this.deps.cache.update(conversationId, (t) =>
            withMessage(t, id, (m) => ({ ...m, status: "failed", statusAt: at })),
        )
    }
}

// Rebuilt from the message once its intent is gone: after a reload, or once the IdP took it.
function resendIntent(message: CachedTimelineMessage, route: SendRoute): SendIntent | null {
    if (!canResend(message)) return null
    if (route.kind === "dm" && !route.recipientActorUri) return null
    const keys = message.attachmentKeys ?? {}
    return {
        ...route,
        content: message.content,
        // Key ids are the attachment ids: the server row is pinned to the sealed blob's id.
        attachmentIds: Object.keys(keys),
        attachmentKeys: Object.values(keys),
        replyTo: message.replyTo ?? null,
    }
}

function textBody(intent: SendIntent): TextBody {
    const body: TextBody = { text: intent.content }
    if (intent.replyTo) {
        body.reply_meta = {
            target_message_id: intent.replyTo.id,
            preview_text: intent.replyTo.content,
            preview_sender: intent.replyTo.author,
        }
    }
    if (intent.attachmentKeys.length > 0) body.attachments = intent.attachmentKeys
    return body
}

function keyed(keys: readonly AttachmentBlobKey[]): Record<string, AttachmentBlobKey> {
    const byId: Record<string, AttachmentBlobKey> = {}
    for (const key of keys) byId[key.id] = key
    return byId
}
