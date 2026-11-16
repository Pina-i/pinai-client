import type { DeviceListEntry } from "./device"
import type { ActorUri, ConversationId, DeviceId } from "./e2ee"
import { DEVICE_REQUIRED, IdpError } from "./idp-error"
import type { LeafClaim } from "./leaf-trust"

/**
 * How long a device holding no group for a conversation leaves a Welcome to bring it in before it
 * joins by itself: while an approved sibling is online, or while the group's tree names this very
 * device (`identity-provider/specs/e2ee.md § 6.14`).
 */
export const WELCOME_WAIT_MS = 60_000

/**
 * A sibling is online while its session was used this recently. The device list tells only a
 * session's last sign-in or renewal, and an open app renews its 1 h token every 48 minutes.
 */
export const SIBLING_ACTIVE_MS = 60 * 60_000

/** How many times a join that lost its epoch to another commit is built again in one run, before it waits for the next. */
export const MAX_JOIN_CONFLICTS = 5

/** When a join left unanswered, or refused for now, is tried again. */
export const JOIN_RETRY_MS = [5_000, 15_000, 60_000, 5 * 60_000, 15 * 60_000] as const

export function joinRetryDelay(attempt: number): number {
    return JOIN_RETRY_MS[Math.min(attempt, JOIN_RETRY_MS.length - 1)]
}

/** The conversations of the list this device holds no group for, none the user was removed from. */
export function conversationsToJoin(
    conversations: readonly { id: ConversationId; removedAt: string | null }[],
    held: readonly ConversationId[],
): ConversationId[] {
    return conversations.filter((c) => c.removedAt === null && !held.includes(c.id)).map((c) => c.id)
}

/**
 * Another device of the account that could add this one by Welcome is online: approved (the list's
 * word: it only decides a wait), unrevoked, signed in and used within {@link SIBLING_ACTIVE_MS}.
 */
export function siblingOnline(devices: readonly DeviceListEntry[], thisDevice: DeviceId, now: number): boolean {
    return devices.some(
        (device) =>
            device.device_id !== thisDevice &&
            device.revoked_at === null &&
            device.signed_in &&
            device.approvals.length > 0 &&
            device.last_active_at !== null &&
            now - Date.parse(device.last_active_at) < SIBLING_ACTIVE_MS,
    )
}

/**
 * What is left of the minute a device leaves an online sibling to add it, from when it found the
 * conversation missing (`since`); 0 once it is up, or with no sibling online.
 */
export function siblingWait(devices: readonly DeviceListEntry[], thisDevice: DeviceId, since: number, now: number): number {
    const left = since + WELCOME_WAIT_MS - now
    return left > 0 && siblingOnline(devices, thisDevice, now) ? left : 0
}

/**
 * What a group's tree says to a device holding no group for it. `join`: the account has leaves
 * there, none of this device's — its devices were in, this one wasn't brought in. `welcome-due`:
 * a leaf names this device — an add made for it, whose Welcome is on its way. `not-added`: no leaf
 * of the account's — it is yet to be added, by a member, with a Welcome.
 */
export type JoinStanding = "join" | "welcome-due" | "not-added"

export function joinStanding(
    leaves: readonly (LeafClaim & { own?: boolean })[],
    me: ActorUri,
    thisDevice: DeviceId,
): JoinStanding {
    const ours = leaves.filter((leaf) => !leaf.own && leaf.credential?.actor_uri === me)
    if (ours.some((leaf) => leaf.credential?.device_id === thisDevice)) return "welcome-due"
    return ours.length > 0 ? "join" : "not-added"
}

/**
 * What a refusal of a join's commit or GroupInfo means. `epoch-lost`: another commit took the
 * epoch (`409`) — the newer GroupInfo, and again. `refused`: for good — not approved, not a member,
 * no such conversation. `not-yet`: the session hasn't named its device yet, a token to renew, too
 * many requests. `unanswered`: no answer, or a server failing — the commit may have been taken.
 */
export type JoinFailure = "epoch-lost" | "refused" | "not-yet" | "unanswered"

export function joinFailure(error: unknown): JoinFailure {
    if (!(error instanceof IdpError) || error.status >= 500) return "unanswered"
    if (error.status === 409) return "epoch-lost"
    if (error.code === DEVICE_REQUIRED || [401, 408, 429].includes(error.status)) return "not-yet"
    return "refused"
}

/**
 * Where a device stands with a conversation once it tried to join it. `joined` now, or `held`
 * already; `no-group`: the conversation has none yet, a first send founds it; `welcome-due` and
 * `not-added` as {@link JoinStanding}; `left-to-sibling`: one to join, left to an online sibling's
 * Welcome for now; `refused` for good.
 */
export type ConversationJoin =
    | { kind: "joined" }
    | { kind: "held" }
    | { kind: "no-group" }
    | { kind: "welcome-due" }
    | { kind: "not-added" }
    | { kind: "left-to-sibling" }
    | { kind: "refused"; error: unknown }

/** A send meant to found a conversation's group found one there: the device joins it instead. */
export class GroupToJoin extends Error {
    readonly conversationId: ConversationId

    constructor(conversationId: ConversationId, cause?: unknown) {
        super(`${conversationId} has an MLS group to join`, { cause })
        this.name = "GroupToJoin"
        this.conversationId = conversationId
    }
}
