import type { PresenceState } from "@/domain/models/presence"

// ── Server → Client events ──────────────────────────────────────────────────

export interface DmEventPayload {
    message_id: string
    conversation_id: string
    kind: "dm" | "group"
    sender_address: string
    sender_display_name: string | null
    content: string
    created_at: string
    reply_to_id?: string | null
    reply_to_content?: string | null
    reply_to_sender?: string | null
    /** Echoed back only on the sender's own optimistic WS sends. */
    client_id?: string | null
}

export interface ReactionEventPayload {
    messageId: string
    reactorActorUri: string
    emoji: string
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

export interface MessageEditedPayload {
    message_id: string
    new_content: string
    edited_at: string
}

export interface PresenceUpdateEventPayload {
    actorUri: string
    state: PresenceState
    timestamp: string
}

export interface TypingEventDataPayload {
    actorUri: string
    conversationId: string
    timestamp: string
}

export type WsServerEvent =
    | { type: "new_dm"; data: DmEventPayload }
    | { type: "message_edited"; data: MessageEditedPayload }
    | { type: "friend_request"; data: FriendEventPayload }
    | { type: "friend_accepted"; data: FriendEventPayload }
    | { type: "friend_removed"; data: FriendEventPayload }
    | { type: "friend_profile_updated"; data: ProfileUpdatePayload }
    | { type: "message_reaction_added"; data: ReactionEventPayload }
    | { type: "message_reaction_removed"; data: ReactionEventPayload }
    | { type: "presence_update"; data: PresenceUpdateEventPayload }
    | { type: "typing"; data: TypingEventDataPayload }
    | { type: "heartbeat_ack"; data?: Record<string, never> }

// ── Client → Server messages ────────────────────────────────────────────────

export type WsClientMessage =
    | {
          type: "send_dm"
          data: { recipient_address: string; content: string; client_id?: string }
      }
    | { type: "heartbeat" }
    | { type: "typing_start"; data: { conversationId: string } }
    | { type: "watch_conversation"; data: { conversationId: string } }
    | { type: "unwatch_conversation"; data: { conversationId: string } }

// ── Connection status ───────────────────────────────────────────────────────

export type WsConnectionStatus = "disconnected" | "connecting" | "connected"

// ── Notification model ──────────────────────────────────────────────────────

export type WsNotificationEventType = "friend_request" | "friend_accepted" | "friend_removed"

export interface WsNotification {
    id: string
    eventType: WsNotificationEventType
    actorUri: string
    displayName: string
    receivedAt: string
    /** Only present for friend_request notifications. */
    friendshipId?: string
}
