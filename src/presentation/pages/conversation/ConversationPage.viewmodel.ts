import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAppStore } from "@/store/store"
import { sendDmWsUseCase } from "@/domain/usecases/ws/send-dm-ws.usecase"
import { sendTypingStartUseCase } from "@/domain/usecases/presence/send-typing-start.usecase"
import { getConversationHistoryUseCase } from "@/domain/usecases/dm/get-conversation-history.usecase"
import { getDmPort, getWsPort } from "@/ioc"
import { actorUriToAddress } from "@/domain/models/identity"
import type { Message } from "@/lib/types"
import type { DirectMessage } from "@/domain/models/dm"
import type { UserProfile } from "@/domain/models/auth"

function mapApiMessage(msg: DirectMessage, currentUser: UserProfile): Message {
    const senderAddress = actorUriToAddress(msg.sender_actor_uri)
    const isOwn = senderAddress === currentUser.address
    const displayName = isOwn
        ? (currentUser.display_name ?? currentUser.preferred_username)
        : (msg.sender_display_name ?? senderAddress.split("@")[0] ?? senderAddress)
    const mapped: Message = {
        id: msg.id,
        author: displayName,
        avatar: displayName.slice(0, 2).toUpperCase(),
        content: msg.content,
        timestamp: new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        color: "#a78bfa",
        edited: msg.edited_at != null,
        reactions: msg.reactions?.map((r) => ({ emoji: r.emoji, count: r.count, reacted: r.reacted_by_me })),
    }
    if (msg.reply_to_id && msg.reply_to_content) {
        mapped.replyTo = {
            id: msg.reply_to_id,
            content: msg.reply_to_content,
            author: msg.reply_to_sender ?? "",
        }
    }
    return mapped
}

export function useConversationPageViewModel(name: string) {
    const user = useAppStore((s) => s.user)
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const dmMessages = useAppStore((s) => s.dmMessages)
    const pushDmMessage = useAppStore((s) => s.pushDmMessage)
    const seedDmMessages = useAppStore((s) => s.seedDmMessages)
    const setActiveDm = useAppStore((s) => s.setActiveDm)
    const clearDmUnread = useAppStore((s) => s.clearDmUnread)
    const typingByConversation = useAppStore((s) => s.typingByConversation)
    const wsStatus = useAppStore((s) => s.wsStatus)

    // Look up the conversation by address (route param) — the DmConversation.address field
    const dmData = localDmConvos.find((d) => d.address === name)
    // The conversation key is the stable UUID (conversation_id)
    const conversationKey = dmData?.id ?? name

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
            .then((msgs) => {
                // API returns newest-first → reverse to oldest-first for display.
                const mapped = msgs.reverse().map((m) => mapApiMessage(m, user))
                seedDmMessages(conversationKey, mapped)
            })
            .catch(() => {
                historyLoadedRef.current = false
            })
    }, [accessToken, idpUrl, user, name, conversationKey, seedDmMessages, dmData])

    const messages = dmMessages[conversationKey] ?? []
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const sendMessage = useCallback(
        async (content: string) => {
            if (!user) return
            // The recipient address is the federation address of the other member
            const recipientAddress = dmData?.address ?? name
            const currentReply = replyingTo
            setReplyingTo(null)

            if (currentReply && accessToken && idpUrl) {
                // Replies go through REST API (supports reply_to_id).
                try {
                    const dm = await getDmPort().sendMessage(idpUrl, accessToken, recipientAddress, content, currentReply.id)
                    pushDmMessage(conversationKey, mapApiMessage(dm, user))
                } catch {
                    // Silent — could show error toast later.
                }
            } else {
                // Regular messages use WebSocket for instant delivery.
                const newMsg: Message = {
                    id: crypto.randomUUID(),
                    author: user.display_name ?? user.preferred_username,
                    avatar: (user.display_name ?? user.preferred_username).slice(0, 2).toUpperCase(),
                    content,
                    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                    color: "#a78bfa",
                }
                pushDmMessage(conversationKey, newMsg)
                try {
                    sendDmWsUseCase(recipientAddress, content, getWsPort(), newMsg.id)
                } catch {
                    // Silent — message already shown optimistically.
                }
            }
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
        },
        [user, conversationKey, dmData, name, pushDmMessage, replyingTo, accessToken, idpUrl],
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

    return {
        user,
        name,
        conversationKey,
        messages,
        messagesEndRef,
        replyingTo,
        sendMessage,
        handleReply,
        handleType,
        cancelReply,
        typingLabel,
    }
}
