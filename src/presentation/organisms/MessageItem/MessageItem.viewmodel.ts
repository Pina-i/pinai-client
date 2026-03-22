import { useCallback, useState } from "react"
import { useAppStore } from "@/store/store"
import { getDmPort } from "@/ioc"
import type { Message } from "@/lib/types"

export function useMessageItemViewModel(
    message: Message,
    conversationKey: string,
    onReply: (messageId: string) => void,
) {
    const user = useAppStore((s) => s.user)
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const updateDmConversation = useAppStore((s) => s.updateDmConversation)
    const updateMessageById = useAppStore((s) => s.updateMessageById)

    const currentDisplayName = user?.display_name ?? user?.preferred_username ?? ""
    const isOwn = message.author === currentDisplayName

    // ─── Edit state ───────────────────────────────────────────────────────────

    const [isEditing, setIsEditing] = useState(false)
    const [editInput, setEditInput] = useState("")

    const startEdit = useCallback(() => {
        setEditInput(message.content)
        setIsEditing(true)
    }, [message.content])

    const cancelEdit = useCallback(() => {
        setIsEditing(false)
        setEditInput("")
    }, [])

    const commitEdit = useCallback(() => {
        const trimmed = editInput.trim()
        if (!trimmed) return

        const previousContent = message.content

        updateDmConversation(conversationKey, (msgs) =>
            msgs.map((m) => (m.id === message.id ? { ...m, content: trimmed, edited: true } : m)),
        )
        setIsEditing(false)
        setEditInput("")

        if (accessToken && idpUrl) {
            getDmPort()
                .editMessage(idpUrl, accessToken, message.id, trimmed)
                .catch(() => {
                    updateMessageById(message.id, (m) => ({ ...m, content: previousContent }))
                })
        }
    }, [editInput, message, conversationKey, updateDmConversation, updateMessageById, accessToken, idpUrl])

    // ─── Reaction ─────────────────────────────────────────────────────────────

    const handleReaction = useCallback(
        (emoji: string) => {
            const wasReacted = message.reactions?.find((r) => r.emoji === emoji)?.reacted ?? false

            updateDmConversation(conversationKey, (msgs) =>
                msgs.map((m) => {
                    if (m.id !== message.id) return m
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

            if (accessToken && idpUrl) {
                const dmPort = getDmPort()
                const apiCall = wasReacted
                    ? dmPort.removeReaction(idpUrl, accessToken, message.id, emoji)
                    : dmPort.addReaction(idpUrl, accessToken, message.id, emoji)
                apiCall.catch(() => {
                    updateMessageById(message.id, (m) => {
                        const reactions = m.reactions ?? []
                        if (wasReacted) {
                            const existing = reactions.find((r) => r.emoji === emoji)
                            if (existing)
                                return {
                                    ...m,
                                    reactions: reactions.map((r) =>
                                        r.emoji === emoji ? { ...r, count: r.count + 1, reacted: true } : r,
                                    ),
                                }
                            return { ...m, reactions: [...reactions, { emoji, count: 1, reacted: true }] }
                        }
                        return {
                            ...m,
                            reactions: reactions
                                .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, reacted: false } : r))
                                .filter((r) => r.count > 0),
                        }
                    })
                })
            }
        },
        [message, conversationKey, updateDmConversation, updateMessageById, accessToken, idpUrl],
    )

    // ─── Delete ───────────────────────────────────────────────────────────────

    const handleDelete = useCallback(() => {
        updateDmConversation(conversationKey, (msgs) => msgs.filter((m) => m.id !== message.id))
    }, [message.id, conversationKey, updateDmConversation])

    // ─── Reply ────────────────────────────────────────────────────────────────

    const handleReply = useCallback(() => {
        onReply(message.id)
    }, [message.id, onReply])

    return {
        isOwn,
        isEditing,
        editInput,
        setEditInput,
        startEdit,
        cancelEdit,
        commitEdit,
        handleReaction,
        handleDelete,
        handleReply,
    }
}
