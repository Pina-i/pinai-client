import type { IWsPort } from "../../ports/ws.port"
import type { UserStatus } from "../../models/presence"

/**
 * Map the UI status palette to the wire-level `PresenceState`.
 *
 * - `online` / `dnd` go through unchanged.
 * - `idle` becomes `away` (the spec name for the same state).
 * - `invisible` is wired as `offline` so peers see "offline" while the
 *   connection stays alive locally — Discord-style. The local store keeps the
 *   user-facing label as `invisible` so the popover still reads correctly.
 */
function uiStatusToWire(status: UserStatus): "online" | "away" | "offline" | "dnd" {
    switch (status) {
        case "online":
            return "online"
        case "idle":
            return "away"
        case "dnd":
            return "dnd"
        case "invisible":
        case "offline":
            return "offline"
    }
}

/**
 * Broadcast a user-chosen presence state to the IdP over the existing WS.
 * Best-effort: the WS adapter swallows send errors when disconnected, and the
 * next reconnect doesn't replay the override (acceptable for an MVP — the
 * heartbeat loop already restores the auto-determined state).
 */
export function setPresenceUseCase(wsPort: IWsPort, status: UserStatus): void {
    try {
        wsPort.send({ type: "set_presence", data: { state: uiStatusToWire(status) } })
    } catch {
        // Connection down — silent; user can re-pick after reconnect.
    }
}
