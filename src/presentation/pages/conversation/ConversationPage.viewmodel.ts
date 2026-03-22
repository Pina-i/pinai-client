import { useCallback, useEffect, useRef, useState } from "react"
import { useAppStore } from "@/store/store"
import { sendDmWsUseCase } from "@/domain/usecases/ws/send-dm-ws.usecase"
import { getConversationHistoryUseCase } from "@/domain/usecases/dm/get-conversation-history.usecase"
import { getDmPort, getWsPort } from "@/ioc"
import { actorUriToAddress } from "@/domain/models/dm"
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

    const dmData = localDmConvos.find((d) => d.name === name)
    const conversationKey = dmData?.id ?? name

    const [replyingTo, setReplyingTo] = useState<{ id: string; content: string; author: string } | null>(null)

    // Sync store so ChannelSidebar highlights the active DM and clear unread badge.
    useEffect(() => {
        setActiveDm(conversationKey)
        clearDmUnread(conversationKey)
        return () => setActiveDm(null)
    }, [conversationKey, setActiveDm, clearDmUnread])

    // Load message history from REST API once per conversation mount.
    const historyLoadedRef = useRef(false)
    useEffect(() => {
        historyLoadedRef.current = false
    }, [name])

    useEffect(() => {
        if (!accessToken || !idpUrl || !user || historyLoadedRef.current) return
        historyLoadedRef.current = true

        getConversationHistoryUseCase(idpUrl, accessToken, name, getDmPort())
            .then((msgs) => {
                // API returns newest-first → reverse to oldest-first for display.
                const mapped = msgs.reverse().map((m) => mapApiMessage(m, user))
                seedDmMessages(conversationKey, mapped)
            })
            .catch(() => {
                historyLoadedRef.current = false
            })
    }, [accessToken, idpUrl, user, name, conversationKey, seedDmMessages])

    const messages = dmMessages[conversationKey] ?? []
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const sendMessage = useCallback(
        async (content: string) => {
            if (!user) return
            const recipientAddress = dmData?.name ?? name
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
                    sendDmWsUseCase(recipientAddress, content, getWsPort())
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

    return {
        user,
        name,
        conversationKey,
        messages,
        messagesEndRef,
        replyingTo,
        sendMessage,
        handleReply,
        cancelReply,
    }
}
