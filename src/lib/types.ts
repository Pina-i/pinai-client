export type UserStatus = "online" | "idle" | "dnd" | "offline"

export interface Message {
    id: string
    author: string
    avatar: string
    content: string
    timestamp: string
    color: string
    edited?: boolean
    reactions?: Array<{ emoji: string; count: number; reacted: boolean }>
    replyTo?: { id: string; content: string; author: string }
}

export interface Server {
    id: string
    name: string
    initials: string
}

export interface Channel {
    id: string
    name: string
    type: "text" | "voice"
    category: string
    description?: string
    unread: number
}

export interface DmConversation {
    /** Stable conversation UUID from the server. */
    id: string
    /** 'dm' or 'group'. */
    kind: "dm" | "group"
    /** Group name (null for DMs). */
    groupName: string | null
    /** Human-readable display name: for DMs derived from the other member, for groups from `groupName`. */
    displayName: string
    /** Federation address of the first other member (used for routing to /dm/$name). */
    address: string
    /**
     * Canonical ActivityPub actor URI of the first other member.
     * `null` for groups (no single "other member" applies).
     * Used as the identity key when calling backend APIs that speak in URIs
     * (e.g. presence lookups). The UI continues to display `address`.
     */
    actorUri: string | null
    avatar: string
    color: string
    status: UserStatus
    lastMessage: string
    unread: number
}

export interface Member {
    id: string
    name: string
    color: string
    status: UserStatus
    role: "Admin" | "Mod" | "Member"
    about: string
}

export interface Friend {
    id: string
    name: string
    avatarUrl: string | null
    status: UserStatus
    activity: string
}
