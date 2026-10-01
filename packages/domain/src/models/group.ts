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

/**
 * The invitee's instance handed out none of their KeyPackages: it refused, knows no such account,
 * has none left, or didn't answer. Nothing changed in the group's MLS state.
 */
export class KeyPackageUnavailable extends Error {
    readonly actorUri: string

    constructor(actorUri: string, cause: unknown) {
        super(`No KeyPackage for ${actorUri}`, { cause })
        this.name = "KeyPackageUnavailable"
        this.actorUri = actorUri
    }
}
