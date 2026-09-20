import type { IWsPort } from "../../ports/ws.port"

export function sendHeartbeatUseCase(wsPort: IWsPort): void {
    try {
        wsPort.send({ type: "heartbeat" })
    } catch {
        // Heartbeat loss is acceptable — the next tick will retry once the
        // connection is back. Reconnection is handled by the adapter.
    }
}
