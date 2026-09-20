import type { WsClientMessage, WsConnectionStatus, WsServerEvent } from "@/domain/models/ws"

export interface IWsPort {
    /** Open a WebSocket connection. */
    connect(wsUrl: string): void

    /** Gracefully close the connection and stop reconnecting. */
    disconnect(): void

    /** Send a typed message to the server. */
    send(message: WsClientMessage): void

    /** Register handler for incoming server events. */
    onEvent(handler: (event: WsServerEvent) => void): void

    /** Register handler for connection status changes. */
    onStatusChange(handler: (status: WsConnectionStatus) => void): void
}
