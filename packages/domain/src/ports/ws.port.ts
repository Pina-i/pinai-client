import type { WsClientMessage, WsConnectionStatus, WsServerEvent } from "../models/ws"

export interface IWsPort {
    /**
     * Open the connection to the IdP at `idpUrl`, with the access token as it is at each attempt:
     * a reconnect after a renewal goes with the new one. No token, no attempt.
     */
    connect(idpUrl: string, accessToken: () => string | null): void

    /** Gracefully close the connection and stop reconnecting. */
    disconnect(): void

    /** Send a typed message to the server. */
    send(message: WsClientMessage): void

    /** Register handler for incoming server events. */
    onEvent(handler: (event: WsServerEvent) => void): void

    /** Register handler for connection status changes. */
    onStatusChange(handler: (status: WsConnectionStatus) => void): void

    /** Register handler for the IdP closing the connection because its session ended; it is not reopened. */
    onSessionEnded(handler: () => void): void
}
