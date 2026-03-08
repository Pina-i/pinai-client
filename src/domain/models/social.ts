export interface FriendRequestResponse {
    friend_request_id: string
    state: string
}

export interface PendingFriendRequest {
    friend_request_id: string
    requester_address: string
    requester_username: string
    state: string
}

export interface UserSummary {
    address: string
    username: string
    avatar_url: string | null
    /** Presence state — not yet implemented server-side, always null for now. */
    status: "online" | "idle" | "dnd" | "offline" | null
}
