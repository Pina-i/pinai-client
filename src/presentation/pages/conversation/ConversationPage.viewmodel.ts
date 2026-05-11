import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAppStore } from "@/store/store"
import { sendDmWsUseCase } from "@/domain/usecases/ws/send-dm-ws.usecase"
import { sendTypingStartUseCase } from "@/domain/usecases/presence/send-typing-start.usecase"
import { getConversationHistoryUseCase } from "@/domain/usecases/dm/get-conversation-history.usecase"
import { getDmPort, getE2eePort, getWsPort } from "@/ioc"
import { actorUriToAddress, addressToActorUri } from "@/domain/models/identity"
import type { Message } from "@/lib/types"
import type { DirectMessage } from "@/domain/models/dm"
import type {
    ApplicationMessage,
    AttachmentBlobKey,
    ReactionBody,
    TextBody,
} from "@/domain/models/e2ee"
import type { UserProfile } from "@/domain/models/auth"

/** Placeholder rendered when an MLS ciphertext can't be decrypted. */
const UNDECRYPTABLE_PLACEHOLDER = "[encrypted]"

/**
 * Decode a base64 string to bytes. The wire format throughout 5a is
 * base64 over JSON; the WASM layer takes/returns Uint8Array.
 */
function b64ToBytes(s: string): Uint8Array {
    const bin = atob(s)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
}

function bytesToB64(bytes: Uint8Array): string {
    let s = ""
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s)
}

/**
 * Try to decrypt an inbound MLS ciphertext for a conversation. Returns
 * the application message (any kind) or null on failure. When
 * `catchUp` is provided the port falls back to fetching missing
 * commits and retrying once.
 */
async function tryDecryptApp(
    conversationId: string,
    mlsCiphertextB64: string,
    catchUp?: { idpUrl: string; accessToken: string },
): Promise<ApplicationMessage | null> {
    try {
        const ct = b64ToBytes(mlsCiphertextB64)
        return await getE2eePort().decryptInbound(conversationId, ct, catchUp)
    } catch {
        return null
    }
}

/**
 * Discriminated outcome of decoding a `direct_messages` row. Text
 * (and replies) project to a UI Message; reactions are folded into
 * the target message's `reactions[]` by the caller. We never display
 * reactions as standalone messages.
 */
type MappedRow =
    | { kind: "message"; message: Message }
    | {
          kind: "reaction"
          reaction_message_id: string
          target_message_id: string
          reactor_address: string
          emoji: string
          op: "add" | "remove"
      }
    | { kind: "skip" }

async function mapApiMessage(
    msg: DirectMessage,
    currentUser: UserProfile,
    catchUp?: { idpUrl: string; accessToken: string },
    cachedById?: Map<string, Message>,
    appliedReactionIds?: Record<string, true>,
): Promise<MappedRow> {
    const senderAddress = actorUriToAddress(msg.sender_actor_uri)
    const isOwn = senderAddress === currentUser.address
    const displayName = isOwn
        ? (currentUser.display_name ?? currentUser.preferred_username)
        : (msg.sender_display_name ?? senderAddress.split("@")[0] ?? senderAddress)

    // History fetched from REST is post-forward-secrecy: the per-message
    // MLS keys are gone for messages we already processed. The
    // persisted `dmMessages` Zustand slice (encrypted at rest in
    // IndexedDB) is the canonical plaintext source for these. Reuse
    // the cached UI message verbatim when it exists; only fall back
    // to decrypt for genuinely-new rows.
    const cached = cachedById?.get(msg.id)
    if (cached) {
        return { kind: "message", message: cached }
    }
    // Reactions we already applied via the live WS path live folded
    // inside their target message's `reactions[]` — there's no
    // standalone entry in `dmMessages` to find via `cachedById`. The
    // store records every applied reaction by its row id in
    // `appliedReactionIds`, so we use that as a second cache layer.
    // Without this check the recv-side ratchet would say "secret
    // deleted" on the second decrypt and we'd fall through to the
    // text branch, pushing a ghost `[encrypted]` row.
    if (appliedReactionIds?.[msg.id]) {
        return { kind: "skip" }
    }
    // Sender path: we never have the recv-side key for our own
    // ciphertext (forward secrecy wipes it on encrypt). Skipping the
    // decrypt avoids a noisy "secret deleted" log and a placeholder
    // row when the optimistic-pushed message hasn't yet been seeded
    // into the store under the server's `msg.id`.
    if (isOwn) {
        return { kind: "skip" }
    }
    const app = await tryDecryptApp(msg.conversation_id, msg.mls_ciphertext, catchUp)

    if (app && app.kind === "reaction") {
        const body = app.body as ReactionBody
        if (
            body &&
            typeof body.target_message_id === "string" &&
            typeof body.emoji === "string" &&
            (body.op === "add" || body.op === "remove")
        ) {
            return {
                kind: "reaction",
                reaction_message_id: msg.id,
                target_message_id: body.target_message_id,
                reactor_address: senderAddress,
                emoji: body.emoji,
                op: body.op,
            }
        }
        return { kind: "skip" }
    }

    let plaintext = UNDECRYPTABLE_PLACEHOLDER
    let inlineReplyMeta: { content: string; author: string } | null = null
    let attachmentKeys: Record<string, AttachmentBlobKey> | undefined
    if (app && app.kind === "text") {
        const body = app.body as TextBody
        if (typeof body?.text === "string") plaintext = body.text
        if (
            body?.reply_meta &&
            typeof body.reply_meta.preview_text === "string" &&
            typeof body.reply_meta.preview_sender === "string"
        ) {
            inlineReplyMeta = {
                content: body.reply_meta.preview_text,
                author: body.reply_meta.preview_sender,
            }
        }
        if (Array.isArray(body?.attachments) && body.attachments.length > 0) {
            attachmentKeys = {}
            for (const k of body.attachments) attachmentKeys[k.id] = k
        }
    }

    const mapped: Message = {
        id: msg.id,
        author: displayName,
        authorAddress: senderAddress,
        avatar: displayName.slice(0, 2).toUpperCase(),
        content: plaintext,
        timestamp: new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        createdAt: msg.created_at,
        color: "#a78bfa",
        edited: msg.edited_at != null,
        attachments: msg.attachments,
        attachmentKeys,
    }
    if (msg.reply_to_id) {
        mapped.replyTo = {
            id: msg.reply_to_id,
            content: inlineReplyMeta?.content ?? "",
            author: inlineReplyMeta?.author ?? "",
        }
    }
    return { kind: "message", message: mapped }
}

export function useConversationPageViewModel(name: string) {
    const user = useAppStore((s) => s.user)
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const dmMessages = useAppStore((s) => s.dmMessages)
    const pushDmMessage = useAppStore((s) => s.pushDmMessage)
    const reconcileDmMessage = useAppStore((s) => s.reconcileDmMessage)
    const updateDmMessage = useAppStore((s) => s.updateDmMessage)
    const seedDmMessages = useAppStore((s) => s.seedDmMessages)
    const applyReaction = useAppStore((s) => s.applyReaction)
    const setActiveDm = useAppStore((s) => s.setActiveDm)
    const clearDmUnread = useAppStore((s) => s.clearDmUnread)
    const typingByConversation = useAppStore((s) => s.typingByConversation)
    const wsStatus = useAppStore((s) => s.wsStatus)

    // Look up the conversation by address (route param) — the DmConversation.address field
    const dmData = localDmConvos.find((d) => d.address === name)

    // On a brand-new conversation the server hasn't told us the
    // conversation_id yet, so `dmData` is undefined. The first send
    // mints a UUID up front (the MLS group_id, pinned via
    // `POST /api/dm`), and from that moment on we want
    // `conversationKey` to be that UUID — otherwise the optimistic
    // pushed under the UUID is invisible to the render path keyed by
    // address. We stash it here as soon as `sendMessage` is called.
    // Once the conversation list refreshes (via the WS-triggered
    // query invalidation) and `dmData` populates with the same UUID,
    // both fallbacks resolve to the same value and the pending state
    // becomes a no-op.
    const [pendingFirstMessageConvId, setPendingFirstMessageConvId] = useState<string | null>(null)

    // The conversation key is the stable UUID (conversation_id). Falls
    // back to `pendingFirstMessageConvId` for the brief window before
    // `dmData` arrives on first send, then to the route-param address
    // before any send has happened at all.
    const conversationKey = dmData?.id ?? pendingFirstMessageConvId ?? name

    const [replyingTo, setReplyingTo] = useState<{ id: string; content: string; author: string } | null>(null)

    // Sync store so ChannelSidebar highlights the active DM and clear unread badge.
    useEffect(() => {
        setActiveDm(conversationKey)
        clearDmUnread(conversationKey)
        return () => setActiveDm(null)
    }, [conversationKey, setActiveDm, clearDmUnread])

    // Tell the IdP to open an outbound SSE for any remote domain involved in
    // this conversation (so cross-instance presence + typing flow back to us).
    // Skip if conversationKey isn't yet a UUID (fresh conversation, no DM sent).
    // Re-emits whenever the WebSocket reaches `connected` so the watch survives
    // a race where ConversationPage mounts before the socket finishes its
    // handshake.
    useEffect(() => {
        const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (!UUID.test(conversationKey)) return
        if (wsStatus !== "connected") return

        const ws = getWsPort()
        try {
            ws.send({ type: "watch_conversation", data: { conversationId: conversationKey } })
        } catch {
            // Will retry on the next wsStatus transition to "connected".
        }
        return () => {
            try {
                ws.send({ type: "unwatch_conversation", data: { conversationId: conversationKey } })
            } catch {
                // Connection already dead; server will drop the watcher on disconnect.
            }
        }
    }, [conversationKey, wsStatus])

    // Load message history from REST API once per conversation mount.
    const historyLoadedRef = useRef(false)
    useEffect(() => {
        historyLoadedRef.current = false
    }, [name])

    useEffect(() => {
        if (!accessToken || !idpUrl || !user || historyLoadedRef.current) return
        // Need the conversation_id to load history. If we don't have the dmData yet, skip.
        if (!dmData) return
        historyLoadedRef.current = true

        getConversationHistoryUseCase(idpUrl, accessToken, dmData.id, getDmPort())
            .then(async (msgs) => {
                // API returns newest-first → reverse to oldest-first for display.
                const reversed = msgs.reverse()
                const catchUp = { idpUrl, accessToken }
                // Snapshot whatever's already persisted in the store
                // so `mapApiMessage` can skip the recv-side decrypt
                // for rows we've already processed via the WS path.
                // Without this, the second decrypt fails with
                // "secret deleted" because MLS wipes the per-message
                // generation key for forward secrecy. Reactions are
                // tracked separately in `appliedReactionIds` because
                // they fold into their target's `reactions[]` rather
                // than landing as their own row in `dmMessages`.
                const snapshot = useAppStore.getState()
                const cachedById = new Map(
                    (snapshot.dmMessages[conversationKey] ?? []).map(
                        (m) => [m.id, m] as const,
                    ),
                )
                const appliedReactionIds = snapshot.appliedReactionIds
                const mapped = await Promise.all(
                    reversed.map((m) =>
                        mapApiMessage(m, user, catchUp, cachedById, appliedReactionIds),
                    ),
                )

                // First pass: seed text messages. Reactions need the
                // target to exist before they can be applied, so do
                // them in a second pass.
                const textMessages = mapped
                    .filter((r): r is Extract<typeof r, { kind: "message" }> => r.kind === "message")
                    .map((r) => r.message)
                seedDmMessages(conversationKey, textMessages)

                // Second pass: replay reaction-kind rows. The slice
                // dedup'd via `appliedReactionIds` so re-mounting
                // never double-counts.
                const ownAddress = user.address
                for (const row of mapped) {
                    if (row.kind !== "reaction") continue
                    applyReaction(
                        conversationKey,
                        {
                            reaction_message_id: row.reaction_message_id,
                            target_message_id: row.target_message_id,
                            reactor_address: row.reactor_address,
                            emoji: row.emoji,
                            op: row.op,
                        },
                        row.reactor_address === ownAddress,
                    )
                }
            })
            .catch(() => {
                historyLoadedRef.current = false
            })
    }, [accessToken, idpUrl, user, name, conversationKey, seedDmMessages, applyReaction, dmData])

    const messages = dmMessages[conversationKey] ?? []
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Send-intent map for failed-message retry. Keyed by the optimistic
    // UUID we generated at send time. Session-only by design — lost on
    // reload, which leaves any `status: "failed"` messages visible but
    // with a disabled retry button (see `MessageStatus`). Lives in a
    // ref so updates don't re-render the page on every keystroke.
    type SendIntent = {
        content: string
        attachmentIds: string[]
        attachmentKeys: AttachmentBlobKey[]
        replyTo: { id: string; content: string; author: string } | null
        recipientAddress: string
        recipientActorUri: string | null
        effectiveConvId: string
        isFirstMessage: boolean
        optimisticAttachmentKeys: Record<string, AttachmentBlobKey>
    }
    const pendingIntentsRef = useRef<Map<string, SendIntent>>(new Map())

    // Network half of the send pipeline. Called from `sendMessage`
    // after the optimistic push, and again from `retrySend` for
    // failures. On success: reconciles the optimistic row to the
    // server's id + flips status to "sent". On failure: flips to
    // "failed"; the intent stays in the ref so the retry button has
    // a payload to work with.
    const runSend = useCallback(
        async (optimisticId: string, intent: SendIntent) => {
            if (!accessToken || !idpUrl || !user) return
            const optimisticKey = intent.effectiveConvId
            const needsRest = !!intent.replyTo || intent.attachmentIds.length > 0

            const reconcileToServer = (dm: DirectMessage) => {
                const mapped: Message = {
                    id: dm.id,
                    author: user.display_name ?? user.preferred_username,
                    authorAddress: user.address,
                    avatar: (user.display_name ?? user.preferred_username).slice(0, 2).toUpperCase(),
                    content: intent.content,
                    timestamp: new Date(dm.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                    createdAt: dm.created_at,
                    color: "#a78bfa",
                    attachments: dm.attachments,
                    status: "sent",
                    statusAt: new Date().toISOString(),
                }
                if (Object.keys(intent.optimisticAttachmentKeys).length > 0) {
                    mapped.attachmentKeys = intent.optimisticAttachmentKeys
                }
                if (intent.replyTo) {
                    mapped.replyTo = {
                        id: intent.replyTo.id,
                        content: intent.replyTo.content,
                        author: intent.replyTo.author,
                    }
                }
                reconcileDmMessage(optimisticKey, optimisticId, mapped)
                pendingIntentsRef.current.delete(optimisticId)
            }

            const markFailed = (e: unknown, stage: string) => {
                // eslint-disable-next-line no-console
                console.warn(`Send failed at ${stage}:`, e)
                updateDmMessage(optimisticKey, optimisticId, {
                    status: "failed",
                    statusAt: new Date().toISOString(),
                })
            }

            // Lazy group bootstrap: on the first message to a contact,
            // claim a KeyPackage for them, build the founding commit +
            // welcome, and dispatch. Idempotent — subsequent sends
            // short-circuit. Cross-IdP works since 5d.1 (the IdP
            // proxies the claim) + 5d.2 (the welcome is routed by the
            // sender's IdP).
            if (intent.recipientActorUri) {
                try {
                    await getE2eePort().ensureGroupExists(
                        idpUrl,
                        accessToken,
                        intent.effectiveConvId,
                        intent.recipientActorUri,
                    )
                } catch (e) {
                    markFailed(e, "ensureGroupExists")
                    return
                }
            }

            const textBody: TextBody = { text: intent.content }
            if (intent.replyTo) {
                textBody.reply_meta = {
                    target_message_id: intent.replyTo.id,
                    preview_text: intent.replyTo.content,
                    preview_sender: intent.replyTo.author,
                }
            }
            if (intent.attachmentKeys.length > 0) {
                textBody.attachments = intent.attachmentKeys
            }
            const appMessage: ApplicationMessage<TextBody> = {
                version: 1,
                kind: "text",
                body: textBody,
            }
            let mlsCiphertextBytes: Uint8Array
            try {
                mlsCiphertextBytes = await getE2eePort().encryptOutbound(
                    intent.effectiveConvId,
                    appMessage,
                )
            } catch (e) {
                markFailed(e, "encryptOutbound")
                return
            }
            const mlsCiphertextB64 = bytesToB64(mlsCiphertextBytes)

            if (needsRest) {
                try {
                    const dm = await getDmPort().sendMessage(
                        idpUrl,
                        accessToken,
                        intent.recipientAddress,
                        mlsCiphertextB64,
                        intent.replyTo?.id,
                        intent.attachmentIds.length > 0 ? intent.attachmentIds : undefined,
                        intent.isFirstMessage ? intent.effectiveConvId : undefined,
                    )
                    reconcileToServer(dm)
                } catch (e) {
                    markFailed(e, "POST /api/dm")
                }
            } else if (intent.isFirstMessage) {
                try {
                    const dm = await getDmPort().sendMessage(
                        idpUrl,
                        accessToken,
                        intent.recipientAddress,
                        mlsCiphertextB64,
                        undefined,
                        undefined,
                        intent.effectiveConvId,
                    )
                    reconcileToServer(dm)
                } catch (e) {
                    markFailed(e, "POST /api/dm (first-message)")
                }
            } else {
                // WS-shortcut send: pass `optimisticId` as `client_id`
                // so the server's `new_dm` echo carries it back and
                // the WS handler can reconcile to "sent" via
                // `isOwnEcho`. WS-send is fire-and-forget — we can't
                // catch a server-side reject here, so the row stays
                // at "sending" until the echo flips it. WS-disconnect
                // surfaces synchronously and is treated as failed.
                try {
                    sendDmWsUseCase(
                        intent.recipientAddress,
                        mlsCiphertextB64,
                        getWsPort(),
                        optimisticId,
                    )
                } catch (e) {
                    markFailed(e, "sendDmWsUseCase")
                }
            }
        },
        [user, accessToken, idpUrl, reconcileDmMessage, updateDmMessage],
    )

    const sendMessage = useCallback(
        async (
            content: string,
            attachmentIds: string[] = [],
            attachmentKeys: AttachmentBlobKey[] = [],
        ) => {
            if (!user) return
            const recipientAddress = dmData?.address ?? name
            const currentReply = replyingTo
            setReplyingTo(null)

            if (!accessToken || !idpUrl) return

            // First-message bootstrap: when there's no DM row yet
            // server-side, `dmData` is undefined so we can't read its
            // `actorUri`. Derive the URI from the route param (which
            // is the recipient's address `username@host`) using the
            // local issuer's scheme — same heuristic the IdP uses
            // server-side for cross-IdP delivery.
            const recipientActorUri =
                dmData?.actorUri ?? addressToActorUri(recipientAddress, idpUrl)

            // The MLS group needs a UUID `group_id`, and the server's
            // `conversations.id` has to match it. Generate the UUID
            // locally on first send, use it for both, and pin it on
            // `POST /api/dm` via `get_or_create_dm_with_id`.
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            const isFirstMessage = !UUID_RE.test(conversationKey)
            const effectiveConvId = isFirstMessage ? crypto.randomUUID() : conversationKey
            const optimisticKey = effectiveConvId

            // Make the viewmodel's `conversationKey` snap to the
            // freshly-minted UUID immediately. Without this the
            // optimistic push lands under `effectiveConvId` but the
            // render path keeps reading from `dmMessages[name]`
            // (address) until the server-side convo lands in
            // `localDmConvos` — the user sees nothing until the
            // network round-trip + conversation-list refetch
            // completes, which is exactly the moment the recipient
            // also receives the message.
            if (isFirstMessage) {
                setPendingFirstMessageConvId(effectiveConvId)
            }

            // Optimistic push *before* any network work. The first-
            // message path runs ensureGroupExists + encrypt + POST,
            // which can stretch several hundred ms — without an
            // up-front push the user sees an empty input until
            // everything returns. `status: "sending"` drives the
            // clock icon next to the timestamp; `runSend` flips it
            // to "sent" or "failed" once the network half lands.
            const optimisticId = crypto.randomUUID()
            const optimisticAttachmentKeys: Record<string, AttachmentBlobKey> = {}
            for (const k of attachmentKeys) optimisticAttachmentKeys[k.id] = k
            const nowDate = new Date()
            const nowIso = nowDate.toISOString()
            const optimisticMsg: Message = {
                id: optimisticId,
                author: user.display_name ?? user.preferred_username,
                authorAddress: user.address,
                avatar: (user.display_name ?? user.preferred_username).slice(0, 2).toUpperCase(),
                content,
                timestamp: nowDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                createdAt: nowIso,
                color: "#a78bfa",
                status: "sending",
                statusAt: nowIso,
            }
            if (Object.keys(optimisticAttachmentKeys).length > 0) {
                optimisticMsg.attachmentKeys = optimisticAttachmentKeys
            }
            if (currentReply) {
                optimisticMsg.replyTo = {
                    id: currentReply.id,
                    content: currentReply.content,
                    author: currentReply.author,
                }
            }
            pushDmMessage(optimisticKey, optimisticMsg)

            const intent: SendIntent = {
                content,
                attachmentIds,
                attachmentKeys,
                replyTo: currentReply
                    ? { id: currentReply.id, content: currentReply.content, author: currentReply.author }
                    : null,
                recipientAddress,
                recipientActorUri,
                effectiveConvId,
                isFirstMessage,
                optimisticAttachmentKeys,
            }
            pendingIntentsRef.current.set(optimisticId, intent)

            await runSend(optimisticId, intent)

            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
        },
        [user, conversationKey, dmData, name, pushDmMessage, replyingTo, accessToken, idpUrl, runSend],
    )

    const retrySend = useCallback(
        async (optimisticId: string) => {
            const intent = pendingIntentsRef.current.get(optimisticId)
            if (!intent) return
            updateDmMessage(intent.effectiveConvId, optimisticId, {
                status: "sending",
                statusAt: new Date().toISOString(),
            })
            await runSend(optimisticId, intent)
        },
        [runSend, updateDmMessage],
    )

    const hasPendingIntent = useCallback(
        (id: string) => pendingIntentsRef.current.has(id),
        [],
    )

    const handleReply = useCallback(
        (messageId: string) => {
            const msg = (dmMessages[conversationKey] ?? []).find((m) => m.id === messageId)
            if (msg) setReplyingTo({ id: msg.id, content: msg.content, author: msg.author })
        },
        [dmMessages, conversationKey],
    )

    const cancelReply = useCallback(() => setReplyingTo(null), [])

    const handleType = useCallback(() => {
        sendTypingStartUseCase(conversationKey, getWsPort())
    }, [conversationKey])

    // Build a "X is typing…" label, excluding the current user.
    const typingLabel = useMemo(() => {
        const entries = typingByConversation[conversationKey] ?? []
        const ownAddress = user?.address
        const others = entries.filter((t) => actorUriToAddress(t.actorUri) !== ownAddress)
        if (others.length === 0) return null
        const dmDisplayName = dmData?.kind === "dm" ? dmData.displayName : null
        if (others.length === 1) {
            return dmDisplayName ? `${dmDisplayName} is typing…` : "Someone is typing…"
        }
        return `${others.length} people are typing…`
    }, [typingByConversation, conversationKey, user?.address, dmData])

    const displayName =
        dmData?.kind === "dm" ? dmData.displayName : (name.split("@")[0] ?? name)

    // Federated address of the conversation's recipient. Mirrors the
    // source `sendMessage` uses (the route param `name` is the
    // canonical `username@host` address). Threaded through
    // `MessageList` so `MessageItem`'s reaction-send path can route
    // without round-tripping through `localDmConvos` — the latter
    // isn't refreshed by the sender's own WS echo and is empty
    // immediately after a first send.
    const recipientAddress = dmData?.address ?? name

    return {
        user,
        name,
        displayName,
        conversationKey,
        recipientAddress,
        messages,
        messagesEndRef,
        replyingTo,
        sendMessage,
        retrySend,
        hasPendingIntent,
        handleReply,
        handleType,
        cancelReply,
        typingLabel,
    }
}
