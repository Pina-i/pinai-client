import { IdpError } from "@pinai/domain/models/idp-error"

type NameOf = (actorUri: string) => string | null

// The two 403s share a code; the IdP's description is what tells the caller's own block apart.
const YOU_BLOCKED = "You blocked this user"

/** What the composer says when the IdP refused a group creation or a new member. */
export function inviteRefusal(error: unknown, nameOf: NameOf): string {
    if (!(error instanceof IdpError)) return error instanceof Error ? error.message : "Something went wrong"
    if (!error.actorUri) return error.message
    const name = nameOf(error.actorUri)
    const who = name ?? "This person"
    if (error.status === 403 && error.message === YOU_BLOCKED) {
        return `You blocked ${name ?? "this person"}. Unblock them to add them.`
    }
    if (error.status === 403) return `${who} can't be added.`
    if (error.status === 404) return `${name ? `${name}'s` : "This person's"} account wasn't found.`
    if (error.status === 502) return `${name ? `${name}'s` : "This person's"} server didn't answer.`
    return error.message
}

/** Who was taken off a new group because their keys couldn't be had; `null` when nobody was. */
export function droppedNotice(dropped: readonly string[], nameOf: NameOf): string | null {
    if (dropped.length === 0) return null
    const named = dropped.map(nameOf).filter((n): n is string => n !== null)
    const unnamed = dropped.length - named.length
    const rest = named.length > 0 ? (unnamed === 1 ? "someone else" : `${unnamed} others`) : unnamed === 1 ? "someone" : `${unnamed} people`
    const parts = [...named, ...(unnamed === 0 ? [] : [rest])]
    const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
    return `Couldn't add ${list}.`
}
