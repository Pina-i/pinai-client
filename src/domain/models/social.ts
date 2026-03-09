export interface FriendRequestResponse {
    friendship_id: string
    status: string
}

export interface PendingFriendRequest {
    friendship_id: string
    actor_uri: string
    username: string
    display_name: string | null
    status: string
}

export interface UserSummary {
    actor_uri: string
    username: string
    display_name: string | null
}

/** Entry returned by GET /api/friends (joined across local users + remote actors). */
export interface FriendListEntry {
    username: string | null
    display_name: string | null
    avatar_url: string | null
    friend_actor_uri: string
    instance: string | null
}
