import type { IWsPort } from "@/domain/ports/ws.port"

/**
 * Sends a `typing_start` message to the server.
 * The server already rate-limits at 1/s per user; this use case mirrors
 * that on the client to avoid pointless WS traffic.
 */
const MIN_INTERVAL_MS = 1000

const lastSentByConversation: Map<string, number> = new Map()

export function sendTypingStartUseCase(conversationId: string, wsPort: IWsPort): void {
    const now = Date.now()
    const last = lastSentByConversation.get(conversationId) ?? 0
    if (now - last < MIN_INTERVAL_MS) return
    lastSentByConversation.set(conversationId, now)
    try {
        wsPort.send({ type: "typing_start", conversationId })
    } catch {
        // Drop — typing is best-effort.
    }
}
