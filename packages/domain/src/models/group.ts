import { sameDevice, type DeviceTrustVerdict, type KnownDevice } from "./device-trust"
import type { LeafOrigin, LeafVerdict } from "./leaf-trust"

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

/**
 * The leaves to commit out of a group's MLS state: every leaf not the device of someone its roster
 * holds — a device of someone it no longer holds, a leaf whose credential names nobody (`actorUri`
 * null), one a check shows forged whomever it names. A leaf left unsettled is taken at its
 * credential's word. None when the roster doesn't hold `me`: that view of the group isn't the user's.
 */
export function leavesToRemove(
    leaves: readonly { leafIndex: number; actorUri: string | null; origin: LeafOrigin }[],
    roster: readonly string[],
    me: string,
): number[] {
    if (!roster.includes(me)) return []
    return leaves
        .filter((leaf) => leaf.actorUri === null || leaf.origin === "forged" || !roster.includes(leaf.actorUri))
        .map((leaf) => leaf.leafIndex)
}

/**
 * The devices of `me` to bring into a group: those an acting verdict found approved that no leaf
 * of the group, verified (`present`), stands for under that root key. A user's devices add one
 * another, so each one reads what the group sends from then on.
 */
export function devicesToAdd(present: readonly LeafVerdict[], me: string, trust: DeviceTrustVerdict): KnownDevice[] {
    if (!trust.acting) return []
    return trust.approved.filter(
        (device) =>
            device.deviceId !== trust.thisDevice &&
            !present.some((leaf) => leaf.ok && leaf.actorUri === me && sameDevice(leaf, device)),
    )
}

/**
 * When a sibling no KeyPackage could be claimed for is tried again: a device publishes its stash
 * only once in, after the approvals that start the sync adding it, and its upload starts none.
 */
export const UNCLAIMED_RETRY_MS = [5_000, 15_000, 60_000, 5 * 60_000, 15 * 60_000] as const

export function unclaimedRetryDelay(attempt: number): number {
    return UNCLAIMED_RETRY_MS[Math.min(attempt, UNCLAIMED_RETRY_MS.length - 1)]
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
