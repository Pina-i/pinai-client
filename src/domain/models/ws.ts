// ── Server → Client events ──────────────────────────────────────────────────

export interface DmEventPayload {
    message_id: string
    sender_address: string
    content: string
    created_at: string
}

export interface FollowEventPayload {
    follow_id: string
    address: string
    username: string
}

export type WsServerEvent =
    | { type: "new_dm"; data: DmEventPayload }
    | { type: "follow_request"; data: FollowEventPayload }
    | { type: "follow_accepted"; data: FollowEventPayload }
    | { type: "follow_rejected"; data: FollowEventPayload }
    | { type: "follow_removed"; data: FollowEventPayload }

// ── Client → Server messages ────────────────────────────────────────────────

export type WsClientMessage = {
    type: "send_dm"
    data: { recipient_address: string; content: string }
}

// ── Connection status ───────────────────────────────────────────────────────

export type WsConnectionStatus = "disconnected" | "connecting" | "connected"

// ── Notification model ──────────────────────────────────────────────────────

export interface WsNotification {
    id: string
    eventType: WsServerEvent["type"]
    address: string
    username: string
    receivedAt: string
}
