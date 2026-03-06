import { useEffect, useRef } from "react"
import { useAppStore } from "@/store/store"
import { getWsPort } from "@/ioc"
import type { WsConnectionStatus, WsServerEvent } from "@/domain/models/ws"

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
                case "follow_request":
                case "follow_accepted":
                case "follow_rejected":
                case "follow_removed": {
                    actionsRef.current.addNotification({
                        id: crypto.randomUUID(),
                        eventType: event.type,
                        address: event.data.address,
                        username: event.data.username,
                        receivedAt: new Date().toISOString(),
                    })
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
