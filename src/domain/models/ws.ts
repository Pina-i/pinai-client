// ── Server → Client events ──────────────────────────────────────────────────

export interface DmEventPayload {
    message_id: string
    sender_address: string
    sender_display_name: string | null
    content: string
    created_at: string
}

export interface FriendEventPayload {
    friendship_id: string
    actor_uri: string
    username: string
    display_name: string | null
}

export interface ProfileUpdatePayload {
    actorUri: string
    displayName: string | null
    avatarUrl: string | null
}

export type WsServerEvent =
    | { type: "new_dm"; data: DmEventPayload }
    | { type: "friend_request"; data: FriendEventPayload }
    | { type: "friend_accepted"; data: FriendEventPayload }
    | { type: "friend_removed"; data: FriendEventPayload }
    | { type: "friend_profile_updated"; data: ProfileUpdatePayload }

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
    actorUri: string
    displayName: string
    receivedAt: string
    /** Only present for friend_request notifications. */
    friendshipId?: string
}
