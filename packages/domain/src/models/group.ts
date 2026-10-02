import type { ActorUri, DeviceId } from "./e2ee"

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

/** How many people a group holds at most, its creator included: the IdP refuses more. */
export const MAX_GROUP_MEMBERS = 50

/** How many more people a group of `members` can take. */
export function seatsLeft(members: number): number {
    return Math.max(0, MAX_GROUP_MEMBERS - members)
}

/** A device's leaf in a group's MLS state, by the credential it carries. */
export interface GroupLeaf {
    leafIndex: number
    actorUri: ActorUri
    deviceId: DeviceId
}

/**
 * The leaves to commit out of a group's MLS state: every device of someone its roster no longer
 * holds. None when the roster doesn't hold `me`: that view of the group isn't the user's.
 */
export function leavesToRemove(
    leaves: readonly GroupLeaf[],
    roster: readonly string[],
    me: string,
): number[] {
    if (!roster.includes(me)) return []
    return leaves.filter((leaf) => !roster.includes(leaf.actorUri)).map((leaf) => leaf.leafIndex)
}

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
