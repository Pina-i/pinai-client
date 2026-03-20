/** Raw API response: a single direct message. */
export interface DirectMessage {
    id: string
    sender_actor_uri: string
    sender_display_name: string | null
    recipient_actor_uri: string
    content: string
    activity_uri: string
    federation_status: "pending" | "delivered" | "failed"
    created_at: string
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

/** Raw API response: one entry from GET /api/dm (conversation list). */
export interface DmConversationSummary {
    other_actor_uri: string
    other_display_name: string | null
    unread_count: number
    last_message_at: string
}

/** Convert an ActivityPub actor URI to an address string (username@domain). */
export function actorUriToAddress(uri: string): string {
    try {
        const url = new URL(uri)
        const username = url.pathname.split("/").filter(Boolean).at(-1) ?? uri
        return `${username}@${url.host}`
    } catch {
        return uri
    }
}
