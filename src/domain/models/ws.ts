// ── Server → Client events ──────────────────────────────────────────────────

export interface DmEventPayload {
    message_id: string
    sender_address: string
    content: string
    created_at: string
}

export interface FriendEventPayload {
    friend_request_id: string
    address: string
    username: string
}

export type WsServerEvent =
    | { type: "new_dm"; data: DmEventPayload }
    | { type: "friend_request"; data: FriendEventPayload }
    | { type: "friend_request_accepted"; data: FriendEventPayload }
    | { type: "friend_request_rejected"; data: FriendEventPayload }
    | { type: "friend_removed"; data: FriendEventPayload }

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
    /** Only present for friend_request notifications. */
    friendRequestId?: string
}
