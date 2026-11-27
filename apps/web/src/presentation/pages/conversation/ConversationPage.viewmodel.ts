import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAppStore } from "@/store/store"
import { sendTypingStartUseCase } from "@pinai/domain/usecases/presence/send-typing-start.usecase"
import { loadConversationUseCase } from "@pinai/domain/usecases/dm/load-conversation.usecase"
import { getDmConversationsUseCase } from "@pinai/domain/usecases/dm/get-dm-conversations.usecase"
import { dmConversationsQueryKey } from "@/presentation/hooks/useLoadDmConversations"
import { getDmPort, getE2eePort, getWsPort } from "@/ioc"
import { isBlocked } from "@pinai/domain/models/block"
import { useBlockUser, useBlocks } from "@/presentation/hooks/useBlocks"
import { addressToActorUri, asActorUri } from "@pinai/domain/models/identity"
import type { Message, TimelineNotice } from "@/lib/types"
import { canResend, findConversation, inTimeOrder, startsConversation } from "@pinai/domain/models/dm"
import { describeGroupEvent, groupEventActor, type GroupEvent } from "@pinai/domain/models/group-event"
import { describeNewDevice, readNewDeviceLines } from "@pinai/domain/models/new-device"
import { useDismissGroup } from "@/presentation/hooks/useDismissGroup"
import { useReadOnReturn } from "@/presentation/hooks/use-read-on-return"
import type { ActorUri, AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import type { SendRoute } from "@pinai/domain/usecases/dm/send-message.usecase"
import type { MessageListHandle } from "@/presentation/organisms/MessageList/MessageList"
import { attachmentCache } from "@/presentation/_libs/attachment-cache"
import { latestImageKeys } from "@/presentation/_libs/attachments"
import { conversationCache } from "@/presentation/_libs/conversation-cache"
import { messageSends, sendContext } from "@/presentation/_libs/message-sends"

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

    useEffect(() => {
        void messageSends().settleStale(conversationKey)
    }, [conversationKey])

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

    // Where this conversation's messages go; none until the conversation has an id.
    const sendRoute = useMemo<SendRoute | null>(
        () =>
            conversationId
                ? {
                      conversationId,
                      kind: dmData?.kind === "group" ? "group" : "dm",
                      recipientAddress: dmData?.address ?? name,
                      recipientActorUri,
                  }
                : null,
        [conversationId, dmData, name, recipientActorUri],
    )

    const sendMessage = useCallback(
        async (
            content: string,
            attachmentIds: string[] = [],
            attachmentKeys: AttachmentBlobKey[] = [],
        ) => {
            // Block while `dm-conversations` is still loading — we
            // can't tell yet whether a row already exists for this
            // address. `sendRoute` is `null` in that window and
            // populates either from `dmData.id` (friend / existing
            // convo) or from a freshly minted UUID (non-friend DM).
            if (!user || !accessToken || !idpUrl) return
            if (!sendRoute || isRemoved) return
            // Groups need only the conversation id; 1:1s need the resolved peer.
            if (sendRoute.kind === "dm" && !sendRoute.recipientActorUri) return
            const currentReply = replyingTo
            setReplyingTo(null)

            await messageSends().send(
                {
                    ...sendRoute,
                    content,
                    attachmentIds,
                    attachmentKeys,
                    replyTo: currentReply
                        ? { id: currentReply.id, content: currentReply.content, author: currentReply.author }
                        : null,
                },
                sendContext(idpUrl, user),
            )
            setTimeout(() => messageListHandleRef.current?.scrollToBottom(), 50)
        },
        [user, accessToken, idpUrl, sendRoute, isRemoved, replyingTo],
    )

    const retrySend = useCallback(
        async (messageId: string) => {
            if (!user || !idpUrl || !sendRoute) return
            // An undelivered message goes out again as a new one, at the end of the list.
            if ((await messageSends().retry(sendRoute, messageId, sendContext(idpUrl, user))) === "resent") {
                setTimeout(() => messageListHandleRef.current?.scrollToBottom(), 50)
            }
        },
        [user, idpUrl, sendRoute],
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
