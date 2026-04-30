/** Raw API response: a single direct message. */
export interface DirectMessage {
    id: string
    conversation_id: string
    sender_actor_uri: string
    sender_display_name: string | null
    content: string
    activity_uri: string
    federation_status: "pending" | "delivered" | "failed"
    created_at: string
    edited_at: string | null
    reply_to_id: string | null
    reply_to_content: string | null
    reply_to_sender: string | null
    reactions: Array<{ emoji: string; count: number; reacted_by_me: boolean }>
}

/** Reaction group as returned by the API, per message. */
export interface ApiReactionGroup {
    emoji: string
    count: number
    reacted_by_me: boolean
}

/** Member info in a conversation list entry. */
export interface ConversationMemberInfo {
    actorUri: string
    displayName: string | null
}

/** Raw API response: one entry from GET /api/dm (conversation list). */
export interface DmConversationSummary {
    conversation_id: string
    kind: "dm" | "group"
    name: string | null
    members: ConversationMemberInfo[]
    last_message_preview: string | null
    last_message_sender: string | null
    unread_count: number
    last_message_at: string | null
}

