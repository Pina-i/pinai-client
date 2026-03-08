import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAppStore } from "@/store/store"
import { getWsPort } from "@/ioc"
import type { WsConnectionStatus, WsServerEvent } from "@/domain/models/ws"
import { friendsQueryKey } from "@/presentation/pages/home/FriendsPanel/FriendsPanel.viewmodel"

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
    const queryClient = useQueryClient()

    // Use refs for store actions to avoid stale closures in adapter callbacks.
    const actionsRef = useRef({ setWsStatus, pushDmMessage, addNotification })
    actionsRef.current = { setWsStatus, pushDmMessage, addNotification }

    useEffect(() => {
        if (!accessToken || !idpUrl) return

        const wsPort = getWsPort()

        wsPort.onStatusChange((status: WsConnectionStatus) => {
            actionsRef.current.setWsStatus(status)
        })

        wsPort.onEvent((event: WsServerEvent) => {
            switch (event.type) {
                case "new_dm": {
                    actionsRef.current.pushDmMessage(event.data.sender_address, {
                        id: event.data.message_id,
                        author: event.data.sender_address,
                        avatar: event.data.sender_address.slice(0, 2).toUpperCase(),
                        content: event.data.content,
                        timestamp: new Date(event.data.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                        }),
                        color: "#a78bfa",
                    })
                    break
                }
                case "friend_request":
                case "friend_request_accepted":
                case "friend_request_rejected":
                case "friend_removed": {
                    actionsRef.current.addNotification({
                        // Stable composite id prevents duplicates with API-seeded notifications.
                        id: `${event.type}:${event.data.friend_request_id}`,
                        eventType: event.type,
                        address: event.data.address,
                        username: event.data.username,
                        receivedAt: new Date().toISOString(),
                        friendRequestId: event.data.friend_request_id,
                    })
                    // When our friend request is accepted, refresh the friends list.
                    if (event.type === "friend_request_accepted" && idpUrl) {
                        queryClient.invalidateQueries({ queryKey: friendsQueryKey(idpUrl) })
                    }
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
