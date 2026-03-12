import { useCallback, useEffect, useRef } from "react"
import { useAppStore } from "@/store/store"
import { sendDmWsUseCase } from "@/domain/usecases/ws/send-dm-ws.usecase"
import { getWsPort } from "@/ioc"
import type { Message } from "@/lib/types"

export function useConversationPageViewModel(name: string) {
    const user = useAppStore((s) => s.user)
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const dmMessages = useAppStore((s) => s.dmMessages)
    const pushDmMessage = useAppStore((s) => s.pushDmMessage)
    const updateDmConversation = useAppStore((s) => s.updateDmConversation)
    const setActiveDm = useAppStore((s) => s.setActiveDm)

    const dmData = localDmConvos.find((d) => d.name === name)
    const conversationKey = dmData?.id ?? name

    // Sync store so ChannelSidebar highlights the active DM
    useEffect(() => {
        setActiveDm(conversationKey)
        return () => setActiveDm(null)
    }, [conversationKey, setActiveDm])

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
