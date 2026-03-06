import { useCallback, useRef, useState } from "react"
import { useAppStore } from "@/store/store"
import { sendFriendRequestUseCase } from "@/domain/usecases/social/send-friend-request.usecase"
import { getSocialPort } from "@/ioc"
import type { Message, Friend } from "@/lib/types"

const initialFriends: Friend[] = [
    { id: "f1", name: "Alice", status: "online", activity: "Playing Valorant" },
    { id: "f2", name: "Bob", status: "idle", activity: "" },
    { id: "f3", name: "Charlie", status: "online", activity: "Listening to Spotify" },
    { id: "f4", name: "Diana", status: "offline", activity: "" },
]

const initialMessages: Record<string, Message[]> = {
    c1: [
        { id: "msg1", author: "Alice", avatar: "AL", content: "Welcome to the general channel!", timestamp: "Today at 10:00 AM", color: "#e879f9" },
        { id: "msg2", author: "Bob", avatar: "BO", content: "Hey everyone!", timestamp: "Today at 10:05 AM", color: "#60a5fa", reactions: [{ emoji: "thumbsup", count: 2, reacted: false }] },
    ],
}

const initialDmMessages: Record<string, Message[]> = {
    dm1: [
        { id: "dm-msg1", author: "Alice", avatar: "AL", content: "Hey there!", timestamp: "Today at 9:00 AM", color: "#e879f9" },
    ],
}

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

    const [messages, setMessages] = useState<Record<string, Message[]>>(initialMessages)
    const [dmMessages, setDmMessages] = useState<Record<string, Message[]>>(initialDmMessages)
    const [friends] = useState<Friend[]>(initialFriends)
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
            ? `Message @${activeDmData?.name ?? ""}`
            : `Message #${currentChannel?.name ?? ""}`

    const messagesEndRef = useRef<HTMLDivElement>(null)

    const sendMessage = useCallback(
        (content: string) => {
            if (!user) return
            const newMsg: Message = {
                id: crypto.randomUUID(),
                author: user.preferred_username,
                avatar: user.preferred_username.slice(0, 2).toUpperCase(),
                content,
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                color: "#a78bfa",
            }
            if (view === "dms" && activeDm) {
                setDmMessages((prev) => ({ ...prev, [activeDm]: [...(prev[activeDm] ?? []), newMsg] }))
            } else {
                setMessages((prev) => ({ ...prev, [activeChannel]: [...(prev[activeChannel] ?? []), newMsg] }))
            }
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
        },
        [user, view, activeDm, activeChannel],
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
                setDmMessages((prev) => ({ ...prev, [activeDm]: update(prev[activeDm] ?? []) }))
            } else {
                setMessages((prev) => ({ ...prev, [activeChannel]: update(prev[activeChannel] ?? []) }))
            }
        },
        [view, activeDm, activeChannel],
    )

    const handleDeleteMessage = useCallback(
        (messageId: string) => {
            const remove = (msgs: Message[]) => msgs.filter((m) => m.id !== messageId)
            if (view === "dms" && activeDm) {
                setDmMessages((prev) => ({ ...prev, [activeDm]: remove(prev[activeDm] ?? []) }))
            } else {
                setMessages((prev) => ({ ...prev, [activeChannel]: remove(prev[activeChannel] ?? []) }))
            }
        },
        [view, activeDm, activeChannel],
    )

    const handleEditMessage = useCallback(
        (messageId: string, content: string) => {
            const edit = (msgs: Message[]) => msgs.map((m) => (m.id === messageId ? { ...m, content } : m))
            if (view === "dms" && activeDm) {
                setDmMessages((prev) => ({ ...prev, [activeDm]: edit(prev[activeDm] ?? []) }))
            } else {
                setMessages((prev) => ({ ...prev, [activeChannel]: edit(prev[activeChannel] ?? []) }))
            }
        },
        [view, activeDm, activeChannel],
    )

    const handleUserClick = useCallback((_author: string) => {
        // Will open user profile when backend is connected
    }, [])

    const sendFriendRequest = useCallback(
        async (handle: string) => {
            if (!accessToken || !idpUrl) throw new Error("Not authenticated")
            return sendFriendRequestUseCase(idpUrl, accessToken, handle, getSocialPort())
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
        friends,
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
