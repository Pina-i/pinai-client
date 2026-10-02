import { pronounsLabel, type ProfileCard } from "@pinai/domain/models/profile"
import { formatFriendsSince } from "./friends-since.helper"

/** `undefined` while the card is read; `null` when the IdP shows nothing of the account. */
export function cardCells(card: ProfileCard | null | undefined, timeZone?: string) {
    return {
        pronouns: pronounsLabel(card?.pronouns ?? null) ?? "—",
        bio: card?.bio ?? null,
        friendsSince: card === undefined ? "—" : formatFriendsSince(card?.friends_since ?? null, timeZone),
    }
}
