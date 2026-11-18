/**
 * "Add a friend": people found by name on the user's instance and among the other instances'
 * people of their groups, or by their exact address anywhere else.
 */
import { matchFolded, type TextMatch } from "./conversation-search"
import type { WsServerEvent } from "./ws"

/** Who someone is to the user, the first that holds: the user blocked them, friends, a request either way. */
export type Relation = "none" | "friend" | "request_sent" | "request_received" | "blocked"

export interface Person {
    actor_uri: string
    address: string
    display_name: string | null
    avatar_url: string | null
    relation: Relation
    /** The request waiting for the user, to accept: only with `request_received`. */
    friendship_id: string | null
}

export interface GroupPerson extends Person {
    /** The latest group the two share; `null` when it has no name. */
    group: string | null
}

export interface PeopleFound {
    /** The user's instance. */
    server: Person[]
    /** Other instances' people from the user's groups. */
    groups: GroupPerson[]
}

export type AddressLookup = { kind: "found"; person: Person } | { kind: "not-found" } | { kind: "unreachable" }

/** What the user did to someone found: an Add or an Accept, from the relation it was made on. */
export interface PersonAction {
    kind: "add" | "accept"
    from: Relation
    answered: boolean
}

export type ShownRelation = Relation | "sending" | "accepting"

export type SearchMode =
    | { kind: "intro" }
    | { kind: "names"; query: string }
    | { kind: "address-incomplete" }
    | { kind: "address"; address: string; domain: string }

const MIN_QUERY_CHARS = 2
const MAX_QUERY_CHARS = 100
const MARK = /\p{M}/u
const CONTROL = /\p{Cc}/u
const LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
const DOMAIN = new RegExp(`^(?:localhost|${LABEL}(?:\\.${LABEL})+)(?::(\\d{1,5}))?$`)

/** What the field holds: too little yet, names, or an address — any `@` makes it one. */
export function searchMode(text: string): SearchMode {
    const typed = text.trim()
    if (typed.includes("@")) return addressMode(typed)
    // Counted as the IdP counts them: a combining mark is an accent, which folds away.
    const chars = Array.from(typed).filter((c) => !MARK.test(c)).length
    return chars < MIN_QUERY_CHARS ? { kind: "intro" } : { kind: "names", query: typed }
}

function addressMode(typed: string): SearchMode {
    // `@kai@moana.social`, as other fediverse apps write it: the IdP drops that `@` too.
    const named = typed.startsWith("@") ? typed.slice(1) : typed
    const at = named.indexOf("@")
    if (at <= 0) return { kind: "address-incomplete" }
    const domain = named.slice(at + 1).toLowerCase()
    const match = DOMAIN.exec(domain)
    const port = match?.[1] === undefined ? null : Number(match[1])
    if (!match || (port !== null && (port < 1 || port > 65535))) return { kind: "address-incomplete" }
    return { kind: "address", address: `${named.slice(0, at)}@${domain}`, domain }
}

/** A search by name the IdP refuses rather than answers: over 100 characters, or a control character. */
export function findsNobody(query: string): boolean {
    return Array.from(query).length > MAX_QUERY_CHARS || CONTROL.test(query)
}

/**
 * Someone's relation as the search shows it: the user's action under way, or answered, over the
 * relation it was made on — an answer of the IdP's saying otherwise wins.
 */
export function shownRelation(relation: Relation, action: PersonAction | undefined): ShownRelation {
    if (!action) return relation
    if (!action.answered) return action.kind === "add" ? "sending" : "accepting"
    if (relation !== action.from) return relation
    return action.kind === "add" ? "request_sent" : "friend"
}

const RELATION_PUSHES: ReadonlySet<WsServerEvent["type"]> = new Set([
    "friend_request",
    "friend_accepted",
    "friend_removed",
    "blocks_updated",
])

/** A push after which someone found may stand otherwise with the user: a request, its answer, an unfriend, a block. */
export function changesRelation(type: WsServerEvent["type"]): boolean {
    return RELATION_PUSHES.has(type)
}

/** Where a search by name matched the name shown, for its highlight: case and accents aside. */
export function nameMatch(name: string, query: string): TextMatch | null {
    return matchFolded(name, query.trim())
}
