export type UserStatus = "online" | "idle" | "dnd" | "offline"

export interface Message {
    id: string
    author: string
    avatar: string
    content: string
    timestamp: string
    color: string
    reactions?: Array<{ emoji: string; count: number; reacted: boolean }>
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
    id: string
    name: string
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
