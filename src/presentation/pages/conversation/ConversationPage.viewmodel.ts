import { useCallback, useEffect, useRef } from "react"
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
        : (senderAddress.split("@")[0] ?? senderAddress)
    return {
        id: msg.id,
        author: displayName,
        avatar: displayName.slice(0, 2).toUpperCase(),
        content: msg.content,
        timestamp: new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        color: "#a78bfa",
    }
}

export function useConversationPageViewModel(name: string) {
    const user = useAppStore((s) => s.user)
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const dmMessages = useAppStore((s) => s.dmMessages)
    const pushDmMessage = useAppStore((s) => s.pushDmMessage)
    const updateDmConversation = useAppStore((s) => s.updateDmConversation)
    const seedDmMessages = useAppStore((s) => s.seedDmMessages)
    const setActiveDm = useAppStore((s) => s.setActiveDm)

    const dmData = localDmConvos.find((d) => d.name === name)
    const conversationKey = dmData?.id ?? name

    // Sync store so ChannelSidebar highlights the active DM
    useEffect(() => {
        setActiveDm(conversationKey)
        return () => setActiveDm(null)
    }, [conversationKey, setActiveDm])

    // Load message history from REST API once per conversation mount
    const historyLoadedRef = useRef(false)
    useEffect(() => {
        historyLoadedRef.current = false
    }, [name])

    useEffect(() => {
        if (!accessToken || !idpUrl || !user || historyLoadedRef.current) return
        historyLoadedRef.current = true

        getConversationHistoryUseCase(idpUrl, accessToken, name, getDmPort())
            .then((msgs) => {
                // API returns newest-first → reverse to oldest-first for display
                const mapped = msgs.reverse().map((m) => mapApiMessage(m, user))
                seedDmMessages(conversationKey, mapped)
            })
            .catch(() => {
                historyLoadedRef.current = false // allow retry on next render
            })
    }, [accessToken, idpUrl, user, name, conversationKey, seedDmMessages])

    const messages = dmMessages[conversationKey] ?? []
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const sendMessage = useCallback(
        (content: string) => {
            if (!user) return
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
                const recipientAddress = dmData?.name ?? name
                sendDmWsUseCase(recipientAddress, content, getWsPort())
            } catch {
                // Silent — message already shown optimistically.
            }
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
        },
        [user, conversationKey, dmData, name, pushDmMessage],
    )

    const handleReaction = useCallback(
        (messageId: string, emoji: string) => {
            updateDmConversation(conversationKey, (msgs) =>
                msgs.map((m) => {
                    if (m.id !== messageId) return m
                    const reactions = m.reactions ?? []
                    const existing = reactions.find((r) => r.emoji === emoji)
                    if (existing) {
                        return {
                            ...m,
                            reactions: existing.reacted
                                ? reactions
                                      .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, reacted: false } : r))
                                      .filter((r) => r.count > 0)
                                : reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, reacted: true } : r)),
                        }
                    }
                    return { ...m, reactions: [...reactions, { emoji, count: 1, reacted: true }] }
                }),
            )
        },
        [conversationKey, updateDmConversation],
    )

    const handleDeleteMessage = useCallback(
        (messageId: string) => {
            updateDmConversation(conversationKey, (msgs) => msgs.filter((m) => m.id !== messageId))
        },
        [conversationKey, updateDmConversation],
    )

    const handleEditMessage = useCallback(
        (messageId: string, content: string) => {
            updateDmConversation(conversationKey, (msgs) =>
                msgs.map((m) => (m.id === messageId ? { ...m, content } : m)),
            )
        },
        [conversationKey, updateDmConversation],
    )

    const handleUserClick = useCallback((_author: string) => {
        // Will open user profile when backend is connected
    }, [])

    return {
        user,
        name,
        messages,
        messagesEndRef,
        sendMessage,
        handleReaction,
        handleDeleteMessage,
        handleEditMessage,
        handleUserClick,
    }
}
