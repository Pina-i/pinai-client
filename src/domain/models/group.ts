/** A member of a group conversation, as returned by the group REST API. */
export interface GroupMember {
    /** Canonical ActivityPub actor URI. */
    actorUri: string
    /** Human-readable name. Never render the handle. */
    displayName: string | null
    avatarUrl: string | null
    role: GroupRole
}

export type GroupRole = "admin" | "member"

/** A group conversation snapshot returned by create / rename. */
export interface GroupView {
    conversationId: string
    kind: string
    name: string | null
    members: GroupMember[]
    createdAt: string
}
