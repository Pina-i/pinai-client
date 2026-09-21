import { useEffect } from "react"
import { useAppStore } from "@/store/store"
import { getWsPort } from "@/ioc"
import { sendHeartbeatUseCase } from "@pinai/domain/usecases/presence/send-heartbeat.usecase"

const HEARTBEAT_INTERVAL_MS = 30_000

/**
 * Sends a `heartbeat` over the WebSocket every 30s while connected.
 * The server uses this to detect idle (`away`) clients (>10min silence).
 */
export function useHeartbeat(): void {
    const wsStatus = useAppStore((s) => s.wsStatus)

    useEffect(() => {
        if (wsStatus !== "connected") return

        const wsPort = getWsPort()
        sendHeartbeatUseCase(wsPort)
        const interval = setInterval(() => sendHeartbeatUseCase(wsPort), HEARTBEAT_INTERVAL_MS)
        return () => clearInterval(interval)
    }, [wsStatus])
}
