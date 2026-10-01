import { actorUriToAddress } from "./identity"

/** Who may message the account or add it to a group, as `PATCH /api/privacy` sets it. */
export type ContactPolicy = "everyone" | "friends_and_groups" | "friends"

/** One entry of `GET /api/blocks`, which lists the newest first. */
export interface BlockedActorEntry {
    actor_uri: string
    display_name: string | null
    avatar_url: string | null
    blocked_at: string
}

/** The people the user blocked, by address: the form the WebSocket and the UI name people in. */
export function blockedAddresses(blocked: readonly BlockedActorEntry[]): ReadonlySet<string> {
    return new Set(blocked.map((b) => actorUriToAddress(b.actor_uri)))
}

/** Whether `person`, an address or an actor URI, is someone the user blocked. */
export function isBlocked(blocked: ReadonlySet<string>, person: string): boolean {
    // An address passes through `actorUriToAddress` unchanged.
    return blocked.has(actorUriToAddress(person))
}

/** Whether a new message counts as unread: not while its conversation is open, never from someone blocked. */
export function countsAsUnread(conversationOpen: boolean, senderBlocked: boolean): boolean {
    return !conversationOpen && !senderBlocked
}
