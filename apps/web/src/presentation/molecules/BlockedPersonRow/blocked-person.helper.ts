import type { BlockedActorEntry } from "@pinai/domain/models/block"
import { actorUriToAddress } from "@pinai/domain/models/identity"

export interface BlockedPerson {
    actorUri: string
    name: string
    address: string
    avatarUrl: string | null
}

export function blockedPeople(entries: readonly BlockedActorEntry[]): BlockedPerson[] {
    return entries.map((entry) => {
        const address = actorUriToAddress(entry.actor_uri)
        return {
            actorUri: entry.actor_uri,
            // The handle only as a last resort: an actor never resolved here has no name.
            name: entry.display_name ?? address.split("@")[0],
            address,
            avatarUrl: entry.avatar_url,
        }
    })
}
