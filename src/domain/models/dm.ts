/** Attachment metadata as returned by the IdP REST API and on the WS new_dm event. */
export interface Attachment {
    id: string
    mime_type: string
    byte_size: number
    original_filename: string
}

/**
 * Raw API response: a single direct message.
 *
 * After Phase 3 the body on the wire is opaque MLS ciphertext, base64-encoded.
 * Reactions, reply previews, and edited content live inside the encrypted
 * stream — server only sees `reply_to_id` for thread routing. Plaintext is
 * reconstructed locally via `IE2eePort.decryptInbound` and cached under
 * `data.plaintextByMessageId` for re-render after MLS forward secrecy
 * deletes the per-message keys.
 */
export interface DirectMessage {
    id: string
    conversation_id: string
    sender_actor_uri: string
    sender_display_name: string | null
    /** Base64 of the TLS-encoded MLSMessage. Server never inspects. */
    mls_ciphertext: string
    activity_uri: string
    federation_status: "pending" | "delivered" | "failed"
    created_at: string
    edited_at: string | null
    /** Server-visible parent ID for thread routing. Preview lives in MLS body. */
    reply_to_id: string | null
    attachments?: Attachment[]
}

/** Member info in a conversation list entry. */
export interface ConversationMemberInfo {
    actorUri: string
    displayName: string | null
    avatarUrl: string | null
}

/**
 * Raw API response: one entry from GET /api/dm (conversation list).
 *
 * Phase 3 dropped `last_message_preview` — the body is opaque ciphertext
 * server-side; the client reconstructs a preview from its decrypted MLS
 * stream (Phase 5+).
 */
export interface DmConversationSummary {
    conversation_id: string
    kind: "dm" | "group"
    name: string | null
    members: ConversationMemberInfo[]
    last_message_sender: string | null
    unread_count: number
    last_message_at: string | null
}

