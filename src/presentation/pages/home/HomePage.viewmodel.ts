import { useCallback, useRef, useState } from "react"
import { useAppStore } from "@/store/store"
import { sendFriendRequestUseCase } from "@/domain/usecases/social/send-friend-request.usecase"
import { sendDmWsUseCase } from "@/domain/usecases/ws/send-dm-ws.usecase"
import { getSocialPort, getWsPort } from "@/ioc"
import type { Message } from "@/lib/types"

export function useHomePageViewModel() {
    const view = useAppStore((s) => s.view)
    const activeDm = useAppStore((s) => s.activeDm)
    const activeChannel = useAppStore((s) => s.activeChannel)
    const activeServer = useAppStore((s) => s.activeServer)
    const searchQuery = useAppStore((s) => s.searchQuery)
    const showPinned = useAppStore((s) => s.showPinned)
    const setShowPinned = useAppStore((s) => s.setShowPinned)
    const openDmWith = useAppStore((s) => s.openDmWith)
    const channelsByServer = useAppStore((s) => s.channelsByServer)
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const user = useAppStore((s) => s.user)
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)

    // DM messages from the store (populated by WebSocket hook + local sends).
    const dmMessages = useAppStore((s) => s.dmMessages)
    const pushDmMessage = useAppStore((s) => s.pushDmMessage)
    const updateDmConversation = useAppStore((s) => s.updateDmConversation)

    // Channel messages remain local (separate chat-server WS in the future).
    const [messages, setMessages] = useState<Record<string, Message[]>>({})
    const [pinnedMessages] = useState<Message[]>([])

    const currentChannel = (channelsByServer[activeServer] ?? []).find((c) => c.id === activeChannel)
    const activeDmData = localDmConvos.find((d) => d.id === activeDm)

    const currentMessages =
        view === "dms" && activeDm ? (dmMessages[activeDm] ?? []) : (messages[activeChannel] ?? [])

    const filteredMessages = searchQuery
        ? currentMessages.filter(
              (m) =>
                  m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  m.author.toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : currentMessages

    const messagePlaceholder =
        view === "dms"
            ? `Message @${activeDmData?.displayName ?? activeDmData?.name ?? ""}`
            : `Message #${currentChannel?.name ?? ""}`

    const messagesEndRef = useRef<HTMLDivElement>(null)

    const sendMessage = useCallback(
        (content: string) => {
            if (!user) return
            const newMsg: Message = {
                id: crypto.randomUUID(),
                author: user.display_name ?? user.preferred_username,
                authorAddress: user.address,
                avatar: (user.display_name ?? user.preferred_username).slice(0, 2).toUpperCase(),
                content,
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                color: "#a78bfa",
            }
            if (view === "dms" && activeDm) {
                // Optimistic push to store.
                pushDmMessage(activeDm, newMsg)
                // Send via WebSocket.
                try {
                    const recipientAddress = activeDmData?.name ?? activeDm
                    sendDmWsUseCase(recipientAddress, content, getWsPort(), newMsg.id)
                } catch {
                    // Silent — message already shown optimistically.
                }
            } else {
                setMessages((prev) => ({ ...prev, [activeChannel]: [...(prev[activeChannel] ?? []), newMsg] }))
            }
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
        },
        [user, view, activeDm, activeDmData, activeChannel, pushDmMessage],
    )

    const handleReaction = useCallback(
        (messageId: string, emoji: string) => {
            const update = (msgs: Message[]) =>
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
                })

            if (view === "dms" && activeDm) {
                updateDmConversation(activeDm, update)
            } else {
                setMessages((prev) => ({ ...prev, [activeChannel]: update(prev[activeChannel] ?? []) }))
            }
        },
        [view, activeDm, activeChannel, updateDmConversation],
    )

    const handleDeleteMessage = useCallback(
        (messageId: string) => {
            const remove = (msgs: Message[]) => msgs.filter((m) => m.id !== messageId)
            if (view === "dms" && activeDm) {
                updateDmConversation(activeDm, remove)
            } else {
                setMessages((prev) => ({ ...prev, [activeChannel]: remove(prev[activeChannel] ?? []) }))
            }
        },
        [view, activeDm, activeChannel, updateDmConversation],
    )

    const handleEditMessage = useCallback(
        (messageId: string, content: string) => {
            const edit = (msgs: Message[]) => msgs.map((m) => (m.id === messageId ? { ...m, content } : m))
            if (view === "dms" && activeDm) {
                updateDmConversation(activeDm, edit)
            } else {
                setMessages((prev) => ({ ...prev, [activeChannel]: edit(prev[activeChannel] ?? []) }))
            }
        },
        [view, activeDm, activeChannel, updateDmConversation],
    )

    const handleUserClick = useCallback((_author: string) => {
        // Will open user profile when backend is connected
    }, [])

    const sendFriendRequest = useCallback(
        async (address: string) => {
            if (!accessToken || !idpUrl) throw new Error("Not authenticated")
            return sendFriendRequestUseCase(idpUrl, accessToken, address, getSocialPort())
        },
        [accessToken, idpUrl],
    )

    return {
        view,
        activeDm,
        user,
        filteredMessages,
        messagePlaceholder,
        messagesEndRef,
        pinnedMessages,
        showPinned,
        setShowPinned,
        searchQuery,
        openDmWith,
        sendMessage,
        handleReaction,
        handleDeleteMessage,
        handleEditMessage,
        handleUserClick,
        sendFriendRequest,
    }
}
