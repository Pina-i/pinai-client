import type { PresenceState } from "@/domain/models/presence"
import type { Attachment } from "@/domain/models/dm"

// ── Server → Client events ──────────────────────────────────────────────────

export interface DmEventPayload {
    message_id: string
    conversation_id: string
    kind: "dm" | "group"
    sender_address: string
    sender_display_name: string | null
    /** Base64-encoded TLS MLSMessage. Client decrypts via IE2eePort. */
    mls_ciphertext: string
    created_at: string
    /** Server-visible parent ID for thread routing. The preview text +
     *  sender display name travel inside the encrypted body. */
    reply_to_id?: string | null
    /** Linked attachments — empty when the sender used the WS `send_dm` path
     *  (which doesn't carry attachment_ids). The REST `POST /api/dm` path
     *  does, and inbound federation DMs preserve them. */
    attachments?: Attachment[]
    /** Echoed back only on the sender's own optimistic WS sends. */
    client_id?: string | null
}

export interface FriendEventPayload {
    friendship_id: string
    actor_uri: string
    username: string
    display_name: string | null
    /** Set on `friend_accepted` — the DM conversation_id the accepter's IdP
     *  minted alongside `set_status('accepted')`. Both sides receive the
     *  same id (the accepter advertises it via the AP envelope), so the
     *  conversation appears in `localDmConvos` immediately on
     *  `dm-conversations` invalidation. Absent on `friend_request` /
     *  `friend_removed`. */
    conversation_id?: string | null
}

export interface ProfileUpdatePayload {
    actorUri: string
    displayName: string | null
    avatarUrl: string | null
}

export interface MessageEditedPayload {
    message_id: string
    /** Replacement TLS MLSMessage, base64. */
    new_mls_ciphertext: string
    edited_at: string
}

/**
 * `mls_welcome_ready` — server side stored a Welcome bundle for one of
 * this device's leaves (either same-IdP via `POST /api/mls/welcomes`,
 * or cross-IdP via the AP inbox). The hook fires
 * `consumePendingWelcomes` so the new group lands in the local MLS
 * adapter within seconds.
 */
export interface MlsWelcomeReadyPayload {
    conversationId: string
    recipientDeviceId: string
}

/**
 * `group_created` — the recipient is a member of a brand-new group. Fired by
 * the hosting IdP for its local members, and by the recipient's own IdP when
 * it materialises a federated group from an inbound MLS snapshot.
 */
export interface GroupCreatedPayload {
    conversationId: string
    name: string | null
    creatorActorUri: string
    createdAt: string
}

export interface MemberAddedPayload {
    conversationId: string
    actorUri: string
    role: string
    addedByActorUri: string
}

export interface MemberRemovedPayload {
    conversationId: string
    actorUri: string
    /** Absent when the member left on their own. */
    removedByActorUri?: string
}

export interface MemberRoleChangedPayload {
    conversationId: string
    actorUri: string
    role: string
    changedByActorUri: string
}

export interface GroupRenamedPayload {
    conversationId: string
    name: string | null
    renamedByActorUri: string
}

/** Fired when a new device of this user completes attestation registration. */
export interface DeviceJoinedPayload {
    actorUri: string
    deviceId: string
    drkPublicKey: string
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
    | { type: "presence_update"; data: PresenceUpdateEventPayload }
    | { type: "typing"; data: TypingEventDataPayload }
    | { type: "mls_welcome_ready"; data: MlsWelcomeReadyPayload }
    | { type: "device_joined"; data: DeviceJoinedPayload }
    | { type: "group_created"; data: GroupCreatedPayload }
    | { type: "member_added"; data: MemberAddedPayload }
    | { type: "member_removed"; data: MemberRemovedPayload }
    | { type: "member_role_changed"; data: MemberRoleChangedPayload }
    | { type: "group_renamed"; data: GroupRenamedPayload }
    | { type: "heartbeat_ack"; data?: Record<string, never> }

// ── Client → Server messages ────────────────────────────────────────────────

export type WsClientMessage =
    | {
          type: "send_dm"
          data: { recipient_address: string; mls_ciphertext: string; client_id?: string }
      }
    | { type: "heartbeat" }
    | { type: "typing_start"; data: { conversationId: string } }
    | { type: "watch_conversation"; data: { conversationId: string } }
    | { type: "unwatch_conversation"; data: { conversationId: string } }
    | { type: "set_presence"; data: { state: "online" | "away" | "offline" | "dnd" } }

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
