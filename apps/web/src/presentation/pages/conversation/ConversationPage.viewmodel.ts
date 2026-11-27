import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAppStore } from "@/store/store"
import { sendTypingStartUseCase } from "@pinai/domain/usecases/presence/send-typing-start.usecase"
import { loadConversationUseCase } from "@pinai/domain/usecases/dm/load-conversation.usecase"
import { getDmConversationsUseCase } from "@pinai/domain/usecases/dm/get-dm-conversations.usecase"
import { dmConversationsQueryKey } from "@/presentation/hooks/useLoadDmConversations"
import { getDmPort, getE2eePort, getGroupPort, getWsPort } from "@/ioc"
import { isBlocked } from "@pinai/domain/models/block"
import { useBlockUser, useBlocks } from "@/presentation/hooks/useBlocks"
import { addressToActorUri, asActorUri } from "@pinai/domain/models/identity"
import type { Message, TimelineNotice } from "@/lib/types"
import {
    UNDECRYPTABLE_TEXT,
    findConversation,
    inTimeOrder,
    settleStaleSend,
    startsConversation,
    type DirectMessage,
} from "@pinai/domain/models/dm"
import { describeGroupEvent, groupEventActor, type GroupEvent } from "@pinai/domain/models/group-event"
import { describeNewDevice, readNewDeviceLines } from "@pinai/domain/models/new-device"
import { useDismissGroup } from "@/presentation/hooks/useDismissGroup"
import { useReadOnReturn } from "@/presentation/hooks/use-read-on-return"
import type { ActorUri, ApplicationMessage, AttachmentBlobKey, TextBody } from "@pinai/domain/models/e2ee"
import { archivedText } from "@pinai/domain/models/history-archive"
import type { MessageListHandle } from "@/presentation/organisms/MessageList/MessageList"
import { attachmentCache } from "@/presentation/_libs/attachment-cache"
import { latestImageKeys } from "@/presentation/_libs/attachments"
import { conversationCache } from "@/presentation/_libs/conversation-cache"
import { enterConversation } from "@/presentation/_libs/conversation-joins"

// Sends this page load is still working on — waiting for the device to join, say —: not stale.
const sendsUnderWay = new Set<string>()

function bytesToB64(bytes: Uint8Array): string {
    let s = ""
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s)
}

// The last screenful or so of a conversation.
const PREFETCHED_IMAGES = 12

// Stable fallbacks: a fresh `[]` per render would defeat every memo downstream.
const NO_MESSAGES: Message[] = []
const NO_EVENTS: GroupEvent[] = []

function timeOfDay(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function useConversationPageViewModel(name: string) {
    const user = useAppStore((s) => s.user)
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const pushDmMessage = useAppStore((s) => s.pushDmMessage)
    const reconcileDmMessage = useAppStore((s) => s.reconcileDmMessage)
    const updateDmMessage = useAppStore((s) => s.updateDmMessage)
    const updateDmConversation = useAppStore((s) => s.updateDmConversation)
    const { blocked } = useBlocks()
    const { unblock, isPending: isUnblocking } = useBlockUser()
    const setActiveDm = useAppStore((s) => s.setActiveDm)
    const clearDmUnread = useAppStore((s) => s.clearDmUnread)
    const wsStatus = useAppStore((s) => s.wsStatus)
    const queryClient = useQueryClient()

    // Route param is a conversation UUID (groups, and sidebar clicks) or a
    // `username@host` address (DMing a not-yet-existing conversation). The two
    // never collide, so one lookup serves both; non-friend DMs mint a UUID below.
    const dmData = useAppStore((s) => findConversation(s.localDmConvos, name))

    // Subscribe to the same `dm-conversations` query the layout fires
    // so we know when the initial load has settled. This is the only
    // signal that distinguishes "still loading, dmData might appear" from
    // "loaded, no conversation exists — safe to mint a fresh UUID". Without
    // it, a reload-then-rapid-send window could mint a UUID for a
    // conversation that already exists server-side, racing the very
    // problem the friendship-accept refactor was meant to fix.
    const { isSuccess: dmConvosLoaded, isError: dmConvosFailed } = useQuery({
        queryKey: dmConversationsQueryKey(idpUrl ?? ""),
        queryFn: () => getDmConversationsUseCase(idpUrl!, accessToken!, getDmPort()),
        enabled: !!accessToken && !!idpUrl,
    })

    // Lazily-minted UUID for fresh non-friend DMs. Keyed on (idpUrl,
    // address) so it stays stable across renders but resets if the
    // route changes. We only mint once we're certain the conversation
    // list has loaded and there's genuinely no row — the loaded flag
    // is what guards against the reload race.
    //
    // Held in state, adjusted during render, rather than cached in a ref: a
    // ref written while rendering is impure, and a render React discards
    // would leave it holding a UUID that was never committed. Setting state
    // during render of the same component is the sanctioned pattern — React
    // re-runs this component immediately and throws the first pass away, so
    // no child ever sees the intermediate `null` and no effect fires on it.
    const [minted, setMinted] = useState<{ key: string; id: string } | null>(null)
    const mintKey = idpUrl && dmConvosLoaded && !dmData && startsConversation(name) ? `${idpUrl}|${name}` : null
    if (mintKey !== null && minted?.key !== mintKey) {
        setMinted({ key: mintKey, id: crypto.randomUUID() })
    }
    const mintedConversationId = mintKey !== null && minted?.key === mintKey ? minted.id : null

    // Resolved conversation_id used everywhere: existing row's id if
    // dmData is present, otherwise the lazily-minted UUID. `null` only
    // during the loading window — sends are blocked then.
    const conversationId = dmData?.id ?? mintedConversationId
    const isRemoved = dmData?.removedAt != null
    const isUnavailable = dmConvosLoaded && !dmData && !startsConversation(name)

    // Resolved recipient actor URI: prefer `dmData.actorUri` (already
    // canonical), fall back to deriving from the route param. The
    // derivation mirrors the IdP's `resolve_remote_actor` heuristic for
    // cross-IdP addresses.
    // `DmConversation.actorUri` is plain `string` (the view-model type predates
    // the `ActorUri` brand), but the value came from the server as a canonical
    // actor URI — `asActorUri` is the sanctioned place to say so.
    const recipientActorUri: ActorUri | null =
        (dmData?.actorUri ? asActorUri(dmData.actorUri) : null) ??
        (idpUrl ? addressToActorUri(name, idpUrl) : null)

    // Stable map/render key. While loading, we fall back to the route
    // param so the page mounts; sends are gated on `conversationId`
    // being a real UUID, so nothing gets persisted under `name`.
    const conversationKey = conversationId ?? name

    const [replyingTo, setReplyingTo] = useState<{ id: string; content: string; author: string } | null>(null)

    // Sync store so ChannelSidebar highlights the active DM and clear unread badge.
    // We deliberately gate on `conversationId` (the UUID) rather than
    // `conversationKey` (which falls back to the route address during
    // the initial loading window) — otherwise `activeDm` is briefly set
    // to `alice@idp.alice.com` instead of the canonical UUID, the socket's
    // read decision (`settleIncomingReadUseCase`, by `openId`) misses any
    // `new_dm` arriving in that window, and the unread badge increments
    // for a conversation the user is actively reading.
    useEffect(() => {
        if (!conversationId) return
        setActiveDm(conversationId)
        clearDmUnread(conversationId)
        // Only clear if we're still the active conversation — during a route
        // transition the exiting page can unmount *after* the next one sets
        // `activeDm`, and an unguarded reset would wipe it (hiding the group
        // members panel when re-entering a group).
        return () => {
            if (useAppStore.getState().activeDm === conversationId) setActiveDm(null)
        }
    }, [conversationId, setActiveDm, clearDmUnread])
    useReadOnReturn(conversationId)

    // Tell the IdP to open an outbound SSE for any remote domain involved in
    // this conversation (so cross-instance presence + typing flow back to us).
    // Skip until we have a real conversation_id (either dmData's or a freshly
    // minted one for a non-friend DM). Re-emits whenever the WebSocket
    // reaches `connected` so the watch survives a race where
    // ConversationPage mounts before the socket finishes its handshake.
    useEffect(() => {
        if (!conversationId || isRemoved) return
        if (wsStatus !== "connected") return

        const ws = getWsPort()
        try {
            ws.send({ type: "watch_conversation", data: { conversationId } })
        } catch {
            // Will retry on the next wsStatus transition to "connected".
        }
        return () => {
            try {
                ws.send({ type: "unwatch_conversation", data: { conversationId } })
            } catch {
                // Connection already dead; server will drop the watcher on disconnect.
            }
        }
    }, [conversationId, isRemoved, wsStatus])

    // Load message history from REST API once per conversation mount.
    const historyLoadedRef = useRef(false)
    // The conversation whose history last answered, failed or not: until then one with nothing cached shows a skeleton.
    const [historyAnswered, setHistoryAnswered] = useState<string | null>(null)
    const isHistoryLoading = dmData ? historyAnswered !== dmData.id : !dmConvosLoaded && !dmConvosFailed
    useEffect(() => {
        historyLoadedRef.current = false
    }, [name])

    useEffect(() => {
        if (!accessToken || !idpUrl || !user || historyLoadedRef.current) return
        // Need the conversation_id to load history. If we don't have the dmData yet, skip.
        if (!dmData) return
        historyLoadedRef.current = true
        const historyOf = dmData.id

        loadConversationUseCase({ idpUrl, accessToken }, dmData.id, user, {
            port: getDmPort(),
            refreshList: () => void queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) }),
            e2ee: getE2eePort(),
            cache: conversationCache,
        })
            .catch(() => {
                historyLoadedRef.current = false
            })
            .finally(() => setHistoryAnswered(historyOf))
    }, [accessToken, idpUrl, user, name, conversationKey, dmData, queryClient])

    // A send left `sending` by a closed page never settles on its own, so
    // opening the conversation fails it and it offers a retry.
    useEffect(() => {
        const now = Date.now()
        updateDmConversation(conversationKey, (list) => {
            const settled = list.map((m) => (sendsUnderWay.has(m.id) ? m : settleStaleSend(m, now)))
            return settled.some((m, i) => m !== list[i]) ? settled : list
        })
    }, [conversationKey, updateDmConversation])

    // This conversation's list only: traffic in other conversations must not re-render the page.
    const messages = useAppStore((s) => s.dmMessages[conversationKey]) ?? NO_MESSAGES
    const signedIn = accessToken !== null
    // Started as the conversation opens, before the deferred list lays their rows out.
    useEffect(() => {
        if (signedIn) attachmentCache.prefetch(latestImageKeys(messages, PREFETCHED_IMAGES))
    }, [messages, signedIn])
    const events = useAppStore((s) => s.groupEvents[conversationKey]) ?? NO_EVENTS
    const newDeviceLines = useAppStore((s) => s.newDeviceLines[conversationKey])
    const myActorUri = user?.actor_uri ?? ""
    const notices = useMemo<TimelineNotice[]>(
        () =>
            inTimeOrder([
                ...events.map((e) => ({
                    id: e.id,
                    createdAt: e.createdAt,
                    text: describeGroupEvent(e, myActorUri),
                    timestamp: timeOfDay(e.createdAt),
                    rename: e.event === "renamed" ? { by: groupEventActor(e, myActorUri), name: e.name ?? "" } : undefined,
                })),
                ...readNewDeviceLines(newDeviceLines).map((line) => ({
                    id: line.id,
                    createdAt: line.createdAt,
                    ...describeNewDevice(line),
                    timestamp: timeOfDay(line.createdAt),
                })),
            ]),
        [events, newDeviceLines, myActorUri],
    )
    // Scroll-to-bottom is an imperative action — page wires a
    // `MessageListHandle` here, viewmodel triggers it after a local
    // send. Old `messagesEndRef.scrollIntoView` only worked when the
    // sentinel `<div ref={...}/>` was in the DOM; the virtualized list
    // doesn't render off-screen rows, so the sentinel-by-ref pattern
    // is gone.
    const messageListHandleRef = useRef<MessageListHandle | null>(null)

    // Send-intent map for failed-message retry. Keyed by the optimistic
    // UUID we generated at send time. Session-only — a retry without an
    // entry rebuilds the intent from the cached message
    // (`intentFromMessage`). Lives in a ref so updates don't re-render
    // the page on every keystroke.
    type SendIntent = {
        content: string
        attachmentIds: string[]
        attachmentKeys: AttachmentBlobKey[]
        replyTo: { id: string; content: string; author: string } | null
        recipientAddress: string
        /** `null` for groups (no single peer). */
        recipientActorUri: ActorUri | null
        conversationId: string
        kind: "dm" | "group"
        optimisticAttachmentKeys: Record<string, AttachmentBlobKey>
        /** Set when this send replaces an undelivered message. */
        resentFrom?: string
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
            const optimisticKey = intent.conversationId
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
                if (intent.resentFrom) mapped.resentFrom = intent.resentFrom
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
                // Not left to the echo: the answer may beat it, and a group's echo carries no client id.
                getE2eePort().bufferForArchive(
                    intent.conversationId,
                    dm.id,
                    archivedText(
                        { address: user.address, displayName: mapped.author },
                        dm.created_at,
                        textBody,
                        dm.attachments,
                    ),
                )
            }

            const markFailed = (e: unknown, stage: string) => {
                // eslint-disable-next-line no-console
                console.warn(`Send failed at ${stage}:`, e)
                updateDmMessage(optimisticKey, optimisticId, {
                    status: "failed",
                    statusAt: new Date().toISOString(),
                })
            }

            if (intent.kind === "dm" && !intent.recipientActorUri) {
                markFailed(new Error("Missing recipient"), "enterConversation")
                return
            }
            // The device in the conversation first — a Welcome or its own join, the message
            // `sending` meanwhile —, or the DM's group founded by its first send.
            sendsUnderWay.add(optimisticId)
            try {
                await enterConversation({
                    id: intent.conversationId,
                    peer: intent.kind === "dm" ? intent.recipientActorUri : null,
                })
            } catch (e) {
                sendsUnderWay.delete(optimisticId)
                markFailed(e, "enterConversation")
                return
            }
            sendsUnderWay.delete(optimisticId)

            const appMessage: ApplicationMessage<TextBody> = {
                version: 1,
                kind: "text",
                body: textBody,
            }
            let mlsCiphertextBytes: Uint8Array
            try {
                mlsCiphertextBytes = await getE2eePort().encryptOutbound(
                    intent.conversationId,
                    appMessage,
                )
            } catch (e) {
                markFailed(e, "encryptOutbound")
                return
            }
            const mlsCiphertextB64 = bytesToB64(mlsCiphertextBytes)

            // Group transport: hand the single ciphertext to the group endpoint,
            // which fans it out to every member. No WS shortcut for groups.
            if (intent.kind === "group") {
                try {
                    const dm = await getGroupPort().sendGroupMessage(
                        idpUrl,
                        accessToken,
                        intent.conversationId,
                        mlsCiphertextB64,
                        intent.replyTo?.id,
                        intent.attachmentIds.length > 0 ? intent.attachmentIds : undefined,
                    )
                    reconcileToServer(dm)
                } catch (e) {
                    markFailed(e, "POST /api/groups/:id/messages")
                }
                return
            }

            // Always over REST, as Discord sends: a refusal answers here, where the socket has no
            // error channel and would leave the message waiting out its timeout.
            try {
                const dm = await getDmPort().sendMessage(
                    idpUrl,
                    accessToken,
                    intent.recipientAddress,
                    mlsCiphertextB64,
                    intent.replyTo?.id,
                    intent.attachmentIds.length > 0 ? intent.attachmentIds : undefined,
                    intent.conversationId,
                    optimisticId,
                )
                reconcileToServer(dm)
            } catch (e) {
                markFailed(e, "POST /api/dm")
            }
        },
        [user, accessToken, idpUrl, reconcileDmMessage, updateDmMessage],
    )

    // Optimistic push, then the network half. Shared by a fresh send and by
    // the resend of an undelivered message, which goes out as a new one.
    const dispatchSend = useCallback(
        async (intent: SendIntent) => {
            if (!user) return
            // Optimistic push *before* any network work.
            // `ensureGroupExists` + encrypt + REST can stretch several
            // hundred ms on first send into a conversation — without
            // an up-front push the user sees an empty input until
            // everything returns. `status: "sending"` drives the clock
            // icon next to the timestamp; `runSend` flips it to "sent"
            // or "failed" once the network half lands.
            const optimisticId = crypto.randomUUID()
            const nowDate = new Date()
            const nowIso = nowDate.toISOString()
            const optimisticMsg: Message = {
                id: optimisticId,
                author: user.display_name ?? user.preferred_username,
                authorAddress: user.address,
                avatar: (user.display_name ?? user.preferred_username).slice(0, 2).toUpperCase(),
                content: intent.content,
                timestamp: nowDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                createdAt: nowIso,
                color: "#a78bfa",
                status: "sending",
                statusAt: nowIso,
            }
            if (Object.keys(intent.optimisticAttachmentKeys).length > 0) {
                optimisticMsg.attachmentKeys = intent.optimisticAttachmentKeys
            }
            if (intent.replyTo) {
                optimisticMsg.replyTo = { ...intent.replyTo }
            }
            if (intent.resentFrom) optimisticMsg.resentFrom = intent.resentFrom
            pushDmMessage(intent.conversationId, optimisticMsg)
            pendingIntentsRef.current.set(optimisticId, intent)

            await runSend(optimisticId, intent)

            setTimeout(() => messageListHandleRef.current?.scrollToBottom(), 50)
        },
        [user, pushDmMessage, runSend],
    )

    const sendMessage = useCallback(
        async (
            content: string,
            attachmentIds: string[] = [],
            attachmentKeys: AttachmentBlobKey[] = [],
        ) => {
            // Block while `dm-conversations` is still loading — we
            // can't tell yet whether a row already exists for this
            // address. `conversationId` is `null` in that window and
            // populates either from `dmData.id` (friend / existing
            // convo) or from a freshly minted UUID (non-friend DM).
            if (!user || !accessToken || !idpUrl) return
            if (!conversationId || isRemoved) return
            // Groups need only the conversation id; 1:1s need the resolved peer.
            const isGroup = dmData?.kind === "group"
            if (!isGroup && !recipientActorUri) return
            const currentReply = replyingTo
            setReplyingTo(null)

            const optimisticAttachmentKeys: Record<string, AttachmentBlobKey> = {}
            for (const k of attachmentKeys) optimisticAttachmentKeys[k.id] = k

            await dispatchSend({
                content,
                attachmentIds,
                attachmentKeys,
                replyTo: currentReply
                    ? { id: currentReply.id, content: currentReply.content, author: currentReply.author }
                    : null,
                recipientAddress: dmData?.address ?? name,
                recipientActorUri,
                conversationId,
                kind: isGroup ? "group" : "dm",
                optimisticAttachmentKeys,
            })
        },
        [user, dmData, name, conversationId, isRemoved, recipientActorUri, replyingTo, accessToken, idpUrl, dispatchSend],
    )

    // Rebuilds a send from the cached message, for when the in-memory intent
    // is gone: after a reload, or once the IdP accepted the message.
    const intentFromMessage = useCallback(
        (message: Message): SendIntent | null => {
            if (!conversationId || message.content === UNDECRYPTABLE_TEXT) return null
            const isGroup = dmData?.kind === "group"
            if (!isGroup && !recipientActorUri) return null
            const keys = message.attachmentKeys ?? {}
            return {
                content: message.content,
                // Key ids are the attachment ids: the server row is pinned to the sealed blob's id.
                attachmentIds: Object.keys(keys),
                attachmentKeys: Object.values(keys),
                replyTo: message.replyTo ?? null,
                recipientAddress: dmData?.address ?? name,
                recipientActorUri,
                conversationId,
                kind: isGroup ? "group" : "dm",
                optimisticAttachmentKeys: keys,
            }
        },
        [conversationId, dmData, name, recipientActorUri],
    )

    const retrySend = useCallback(
        async (messageId: string) => {
            const message = useAppStore.getState().dmMessages[conversationKey]?.find((m) => m.id === messageId)
            if (!message) return

            if (message.status === "undelivered") {
                const intent = intentFromMessage(message)
                if (!intent) return
                // The undelivered row stays as the record of that attempt.
                updateDmMessage(conversationKey, messageId, { resent: true })
                await dispatchSend({ ...intent, resentFrom: messageId })
                return
            }

            const intent = pendingIntentsRef.current.get(messageId) ?? intentFromMessage(message)
            if (!intent) return
            pendingIntentsRef.current.set(messageId, intent)
            updateDmMessage(conversationKey, messageId, {
                status: "sending",
                statusAt: new Date().toISOString(),
            })
            await runSend(messageId, intent)
        },
        [conversationKey, intentFromMessage, dispatchSend, runSend, updateDmMessage],
    )

    // A resend needs the plaintext, which a device that never held it
    // (another device's echo) only has as the placeholder.
    const canResend = useCallback(
        (message: Message) => message.content !== UNDECRYPTABLE_TEXT,
        [],
    )

    // Reads the store when pressed rather than closing over the list, so the
    // callback stays stable and the message rows it is handed to stay cached.
    const handleReply = useCallback(
        (messageId: string) => {
            const msg = useAppStore.getState().dmMessages[conversationKey]?.find((m) => m.id === messageId)
            if (msg) setReplyingTo({ id: msg.id, content: msg.content, author: msg.author })
        },
        [conversationKey],
    )

    const cancelReply = useCallback(() => setReplyingTo(null), [])

    const handleType = useCallback(() => {
        sendTypingStartUseCase(conversationKey, getWsPort())
    }, [conversationKey])


    const displayName = dmData?.displayName ?? (name.split("@")[0] ?? name)

    // Federated address of the conversation's recipient. Mirrors the
    // source `sendMessage` uses (the route param `name` is the
    // canonical `username@host` address). Threaded through
    // `MessageList` so `MessageItem`'s reaction-send path can route
    // without round-tripping through `localDmConvos` — the latter
    // isn't refreshed by the sender's own WS echo and is empty
    // immediately after a first send.
    const recipientAddress = dmData?.address ?? name
    const isGroup = dmData?.kind === "group"
    // Nothing can be written to someone blocked: the IdP would refuse it anyway.
    const peerBlocked = !isGroup && isBlocked(blocked, recipientAddress)
    const unblockPeer = useCallback(() => {
        if (recipientActorUri) void unblock(recipientActorUri, displayName)
    }, [recipientActorUri, unblock, displayName])

    const { dismiss, isPending: isDismissing } = useDismissGroup()
    const [isConfirmingDismiss, setIsConfirmingDismiss] = useState(false)
    const askDismiss = useCallback(() => setIsConfirmingDismiss(true), [])
    const cancelDismiss = useCallback(() => setIsConfirmingDismiss(false), [])
    async function confirmDismiss() {
        if (dmData && (await dismiss(dmData.id))) setIsConfirmingDismiss(false)
    }

    return {
        user,
        name,
        displayName,
        conversationKey,
        recipientAddress,
        isGroup,
        messages,
        notices,
        isHistoryLoading,
        messageListHandleRef,
        replyingTo,
        sendMessage,
        retrySend,
        canResend,
        handleReply,
        handleType,
        cancelReply,
        typingPeerName: dmData?.kind === "dm" ? dmData.displayName : null,
        peerBlocked,
        unblockPeer,
        isUnblocking,
        isRemoved,
        isUnavailable,
        isConfirmingDismiss,
        askDismiss,
        cancelDismiss,
        confirmDismiss,
        isDismissing,
    }
}
