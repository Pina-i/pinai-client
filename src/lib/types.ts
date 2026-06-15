export type UserStatus = "online" | "idle" | "dnd" | "invisible" | "offline"

import type { Attachment } from "@/domain/models/dm"
import type { AttachmentBlobKey } from "@/domain/models/e2ee"

export interface Message {
    id: string
    author: string
    /** Federated address of the sender (`username@domain`). Used to resolve
     *  the current avatar from `avatarsByAddress`. Optional only for legacy
     *  callers; new construction sites should always populate it. */
    authorAddress?: string
    avatar: string
    content: string
    /** Pre-formatted display string ("HH:MM"). Shown next to the author name. */
    timestamp: string
    /** ISO 8601 instant — used to group messages under day separators. */
    createdAt: string
    color: string
    edited?: boolean
    reactions?: Array<{ emoji: string; count: number; reacted: boolean }>
    replyTo?: { id: string; content: string; author: string }
    /** Linked attachments resolved from the server. Empty/undefined → none.
     *  Server-visible metadata is placeholder ("encrypted" /
     *  "application/octet-stream") under E2EE — real filename + MIME +
     *  size live inside `attachmentKeys`. */
    attachments?: Attachment[]
    /** Decryption material per attachment id, populated when the MLS
     *  body has been decrypted. Missing → caller must fall back to the
     *  placeholder wire metadata in `attachments`. */
    attachmentKeys?: Record<string, AttachmentBlobKey>
    /** Send lifecycle for own messages. Absent → indicator hidden.
     *  - `"sending"`: optimistic push, network in flight.
     *  - `"sent"`: server confirmed; check icon auto-hides ~3s after
     *    `statusAt` (no permanent ✓ clutter on history).
     *  - `"failed"`: caught error; renders ⚠ + a retry icon-button.
     *  Persisted alongside the rest of `dmMessages` — the
     *  fade-window math naturally re-hides "sent" icons on reload. */
    status?: "sending" | "sent" | "failed"
    /** ISO instant of the last `status` change. Drives the 3-second
     *  fade for the "sent" check. */
    statusAt?: string
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
    /** Total participants (the caller + every other active member). */
    memberCount: number
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
