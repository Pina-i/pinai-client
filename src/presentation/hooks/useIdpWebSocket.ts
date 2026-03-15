import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAppStore } from "@/store/store"
import { getWsPort } from "@/ioc"
import type { WsConnectionStatus, WsServerEvent } from "@/domain/models/ws"
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
    const setWsStatus = useAppStore((s) => s.setWsStatus)
    const pushDmMessage = useAppStore((s) => s.pushDmMessage)
    const addNotification = useAppStore((s) => s.addNotification)
    const bumpDmConversationsVersion = useAppStore((s) => s.bumpDmConversationsVersion)
    const incrementDmUnread = useAppStore((s) => s.incrementDmUnread)
    const activeDm = useAppStore((s) => s.activeDm)
    const queryClient = useQueryClient()

    // Use refs for store actions to avoid stale closures in adapter callbacks.
    const actionsRef = useRef({ setWsStatus, pushDmMessage, addNotification, bumpDmConversationsVersion, incrementDmUnread, activeDm })
    actionsRef.current = { setWsStatus, pushDmMessage, addNotification, bumpDmConversationsVersion, incrementDmUnread, activeDm }

    useEffect(() => {
        if (!accessToken || !idpUrl) return

        const wsPort = getWsPort()

        wsPort.onStatusChange((status: WsConnectionStatus) => {
            actionsRef.current.setWsStatus(status)
        })

        wsPort.onEvent((event: WsServerEvent) => {
            switch (event.type) {
                case "new_dm": {
                    const senderAddress = actorUriToAddress(event.data.sender_address)
                    const senderDisplayName =
                        event.data.sender_display_name ?? senderAddress.split("@")[0] ?? senderAddress
                    actionsRef.current.pushDmMessage(senderAddress, {
                        id: event.data.message_id,
                        author: senderDisplayName,
                        avatar: senderDisplayName.slice(0, 2).toUpperCase(),
                        content: event.data.content,
                        timestamp: new Date(event.data.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                        }),
                        color: "#a78bfa",
                    })
                    // Notify if the user is not currently viewing this conversation.
                    if (actionsRef.current.activeDm !== senderAddress) {
                        actionsRef.current.incrementDmUnread(senderAddress)
                        playDmNotificationSound()
                    }
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
