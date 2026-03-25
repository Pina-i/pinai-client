import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAppStore } from "@/store/store"
import { getWsPort } from "@/ioc"
import type { WsConnectionStatus, WsServerEvent } from "@/domain/models/ws"
import type { Message } from "@/lib/types"
import { actorUriToAddress } from "@/domain/models/dm"
import { friendsQueryKey } from "@/presentation/pages/home/FriendsPanel/FriendsPanel.viewmodel"
import { playDmNotificationSound } from "@/presentation/_libs/notification-sound"

/**
 * Manages the IdP WebSocket lifecycle.
 * Connects when authenticated, disconnects on logout or unmount.
 * Dispatches incoming events to the Zustand store.
 */
export function useIdpWebSocket(): void {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const user = useAppStore((s) => s.user)
    const setWsStatus = useAppStore((s) => s.setWsStatus)
    const pushDmMessage = useAppStore((s) => s.pushDmMessage)
    const addNotification = useAppStore((s) => s.addNotification)
    const bumpDmConversationsVersion = useAppStore((s) => s.bumpDmConversationsVersion)
    const incrementDmUnread = useAppStore((s) => s.incrementDmUnread)
    const updateMessageById = useAppStore((s) => s.updateMessageById)
    const activeDm = useAppStore((s) => s.activeDm)
    const queryClient = useQueryClient()

    // Use refs for store actions to avoid stale closures in adapter callbacks.
    const actionsRef = useRef({ setWsStatus, pushDmMessage, addNotification, bumpDmConversationsVersion, incrementDmUnread, updateMessageById, activeDm, user })
    actionsRef.current = { setWsStatus, pushDmMessage, addNotification, bumpDmConversationsVersion, incrementDmUnread, updateMessageById, activeDm, user }

    useEffect(() => {
        if (!accessToken || !idpUrl) return

        const wsPort = getWsPort()

        wsPort.onStatusChange((status: WsConnectionStatus) => {
            actionsRef.current.setWsStatus(status)
        })

        wsPort.onEvent((event: WsServerEvent) => {
            switch (event.type) {
                case "new_dm": {
                    const conversationId = event.data.conversation_id
                    const senderDisplayName =
                        event.data.sender_display_name ?? actorUriToAddress(event.data.sender_address).split("@")[0] ?? "?"
                    const msg: Message = {
                        id: event.data.message_id,
                        author: senderDisplayName,
                        avatar: senderDisplayName.slice(0, 2).toUpperCase(),
                        content: event.data.content,
                        timestamp: new Date(event.data.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                        }),
                        color: "#a78bfa",
                    }
                    if (event.data.reply_to_id && event.data.reply_to_content) {
                        msg.replyTo = {
                            id: event.data.reply_to_id,
                            content: event.data.reply_to_content,
                            author: event.data.reply_to_sender ?? "",
                        }
                    }
                    actionsRef.current.pushDmMessage(conversationId, msg)
                    // Notify if the user is not currently viewing this conversation.
                    if (actionsRef.current.activeDm !== conversationId) {
                        actionsRef.current.incrementDmUnread(conversationId)
                        playDmNotificationSound()
                    }
                    break
                }
                case "message_edited": {
                    const { message_id, new_content } = event.data
                    actionsRef.current.updateMessageById(message_id, (m) => ({
                        ...m,
                        content: new_content,
                        edited: true,
                    }))
                    break
                }
                case "message_reaction_added": {
                    const { messageId, reactorActorUri, emoji } = event.data
                    const reactorAddr = actorUriToAddress(reactorActorUri)
                    const isOwn = reactorAddr === actionsRef.current.user?.address
                    // Skip own reactions — already handled by optimistic update.
                    if (isOwn) break
                    actionsRef.current.updateMessageById(messageId, (m) => {
                        const reactions = m.reactions ?? []
                        const existing = reactions.find((r) => r.emoji === emoji)
                        if (existing) {
                            return { ...m, reactions: reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1 } : r)) }
                        }
                        return { ...m, reactions: [...reactions, { emoji, count: 1, reacted: false }] }
                    })
                    break
                }
                case "message_reaction_removed": {
                    const { messageId, reactorActorUri, emoji } = event.data
                    const reactorAddr = actorUriToAddress(reactorActorUri)
                    const isOwn = reactorAddr === actionsRef.current.user?.address
                    if (isOwn) break
                    actionsRef.current.updateMessageById(messageId, (m) => {
                        const reactions = m.reactions ?? []
                        return {
                            ...m,
                            reactions: reactions
                                .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1 } : r))
                                .filter((r) => r.count > 0),
                        }
                    })
                    break
                }
                case "friend_request":
                case "friend_accepted":
                case "friend_removed": {
                    actionsRef.current.addNotification({
                        // Stable composite id prevents duplicates with API-seeded notifications.
                        id: `${event.type}:${event.data.friendship_id}`,
                        eventType: event.type,
                        actorUri: event.data.actor_uri,
                        displayName: event.data.display_name ?? event.data.username,
                        receivedAt: new Date().toISOString(),
                        friendshipId: event.data.friendship_id,
                    })
                    // When our friend request is accepted, refresh the friends list.
                    if (event.type === "friend_accepted" && idpUrl) {
                        queryClient.invalidateQueries({ queryKey: friendsQueryKey(idpUrl) })
                    }
                    // When a friend is removed, also refresh.
                    if (event.type === "friend_removed" && idpUrl) {
                        queryClient.invalidateQueries({ queryKey: friendsQueryKey(idpUrl) })
                    }
                    break
                }
                case "friend_profile_updated": {
                    // A friend's profile was updated — refresh friends list and DM conversation names.
                    if (idpUrl) {
                        queryClient.invalidateQueries({ queryKey: friendsQueryKey(idpUrl) })
                    }
                    actionsRef.current.bumpDmConversationsVersion()
                    break
                }
            }
        })

        // Build WebSocket URL: convert http(s) scheme to ws(s).
        const wsUrl = `${idpUrl.replace(/^http/, "ws")}/ws?token=${accessToken}`
        wsPort.connect(wsUrl)

        return () => {
            wsPort.disconnect()
        }
    }, [accessToken, idpUrl])
}
