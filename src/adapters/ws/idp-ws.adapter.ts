import type { IWsPort } from "@/domain/ports/ws.port"
import type { WsClientMessage, WsConnectionStatus, WsServerEvent } from "@/domain/models/ws"

const MAX_RECONNECT_DELAY = 30_000

export class IdpWsAdapter implements IWsPort {
    private ws: WebSocket | null = null
    private eventHandler: ((event: WsServerEvent) => void) | null = null
    private statusHandler: ((status: WsConnectionStatus) => void) | null = null
    private intentionalClose = false
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null
    private reconnectAttempt = 0
    private currentUrl: string | null = null

    connect(wsUrl: string): void {
        // Close any existing connection first.
        if (this.ws) {
            this.intentionalClose = true
            this.ws.close()
            this.ws = null
        }

        this.intentionalClose = false
        this.currentUrl = wsUrl
        this.clearReconnectTimer()
        this.setStatus("connecting")

        const ws = new WebSocket(wsUrl)

        ws.onopen = () => {
            this.reconnectAttempt = 0
            this.setStatus("connected")
        }

        ws.onclose = () => {
            this.ws = null
            this.setStatus("disconnected")

            if (!this.intentionalClose && this.currentUrl) {
                this.scheduleReconnect()
            }
        }

        ws.onerror = () => {
            // onclose will fire after onerror, so reconnect is handled there.
        }

        ws.onmessage = (event) => {
            if (!this.eventHandler) return
            try {
                const parsed = JSON.parse(event.data as string) as WsServerEvent
                this.eventHandler(parsed)
            } catch {
                // Ignore malformed messages.
            }
        }

        this.ws = ws
    }

    disconnect(): void {
        this.intentionalClose = true
        this.currentUrl = null
        this.clearReconnectTimer()
        if (this.ws) {
            this.ws.close()
            this.ws = null
        }
        this.setStatus("disconnected")
    }

    send(message: WsClientMessage): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not connected")
        }
        this.ws.send(JSON.stringify(message))
    }

    onEvent(handler: (event: WsServerEvent) => void): void {
        this.eventHandler = handler
    }

    onStatusChange(handler: (status: WsConnectionStatus) => void): void {
        this.statusHandler = handler
    }

    private setStatus(status: WsConnectionStatus): void {
        this.statusHandler?.(status)
    }

    private scheduleReconnect(): void {
        const delay = Math.min(1000 * 2 ** this.reconnectAttempt, MAX_RECONNECT_DELAY)
        this.reconnectAttempt++
        this.reconnectTimer = setTimeout(() => {
            if (this.currentUrl && !this.intentionalClose) {
                this.connect(this.currentUrl)
            }
        }, delay)
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }
    }
}
