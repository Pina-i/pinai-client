import type { IWsPort } from "@pinai/domain/ports/ws.port"
import type { WsClientMessage, WsConnectionStatus, WsServerEvent } from "@pinai/domain/models/ws"

const MAX_RECONNECT_DELAY = 30_000
/** The close code the IdP ends a connection with when its session ended. */
const POLICY_VIOLATION = 1008

interface Target {
    idpUrl: string
    accessToken: () => string | null
}

export class IdpWsAdapter implements IWsPort {
    private ws: WebSocket | null = null
    private eventHandler: ((event: WsServerEvent) => void) | null = null
    private statusHandler: ((status: WsConnectionStatus) => void) | null = null
    private sessionEndedHandler: (() => void) | null = null
    private intentionalClose = false
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null
    private reconnectAttempt = 0
    private target: Target | null = null

    connect(idpUrl: string, accessToken: () => string | null): void {
        // Close any existing connection and null its handlers so it cannot
        // dispatch events after we hand off to the new connection.
        if (this.ws) {
            this.intentionalClose = true
            this.ws.onmessage = null
            this.ws.onclose = null
            this.ws.onopen = null
            this.ws.close()
            this.ws = null
        }

        this.intentionalClose = false
        this.target = { idpUrl, accessToken }
        this.clearReconnectTimer()
        const token = accessToken()
        if (!token) {
            this.setStatus("disconnected")
            return
        }
        this.setStatus("connecting")

        const ws = new WebSocket(`${idpUrl.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`)

        ws.onopen = () => {
            this.reconnectAttempt = 0
            this.setStatus("connected")
        }

        ws.onclose = (event) => {
            this.ws = null
            this.setStatus("disconnected")

            if (event.code === POLICY_VIOLATION) {
                // Any token of that session is refused now: what comes next is the app's call.
                this.target = null
                this.sessionEndedHandler?.()
                return
            }
            if (!this.intentionalClose && this.target) {
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
        this.target = null
        this.clearReconnectTimer()
        if (this.ws) {
            this.ws.onmessage = null
            this.ws.onclose = null
            this.ws.onopen = null
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

    onSessionEnded(handler: () => void): void {
        this.sessionEndedHandler = handler
    }

    private setStatus(status: WsConnectionStatus): void {
        this.statusHandler?.(status)
    }

    private scheduleReconnect(): void {
        const delay = Math.min(1000 * 2 ** this.reconnectAttempt, MAX_RECONNECT_DELAY)
        this.reconnectAttempt++
        this.reconnectTimer = setTimeout(() => {
            if (this.target && !this.intentionalClose) {
                this.connect(this.target.idpUrl, this.target.accessToken)
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
