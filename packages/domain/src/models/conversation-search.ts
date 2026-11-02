/**
 * The DM sidebar's search, "Find or start a conversation": the user's friends, their
 * conversations and the chat servers they joined, matched on the texts the sidebar shows.
 */

/** A stretch of a displayed text, in UTF-16 units: what a search matched there. */
export interface TextMatch {
    start: number
    end: number
}

/** Which of a row's texts matched: its name, its address, or one of a group's members. */
export type SearchField = "name" | "address" | "member"

export interface SearchHit<T> {
    item: T
    field: SearchField
    /** The text that matched, as displayed. */
    text: string
    match: TextMatch
}

export type Place<S, Ch> = { kind: "server"; server: S } | { kind: "channel"; server: S; channel: Ch }

export interface SearchSources<F, C, S, Ch> {
    friends: F[]
    conversations: C[]
    servers: { server: S; channels: Ch[] }[]
}

export interface SearchResults<F, C, S, Ch> {
    people: SearchHit<F>[]
    /** Groups, and the 1:1s with people who aren't friends: a friend's own is their row in `people`. */
    conversations: SearchHit<C>[]
    /** Servers and channels; at equal rank, the servers first. */
    places: SearchHit<Place<S, Ch>>[]
}

// Names are written with and without the ʻokina, or with an apostrophe or a backtick in its place.
const APOSTROPHES = new Set(["'", "`", "‘", "’", "ʻ", "ʼ"])
// Letters NFKD leaves whole, as someone typing the name without them would write them.
const BASE_LETTERS: Record<string, string> = { đ: "d", ħ: "h", ı: "i", ł: "l", ø: "o", ß: "ss", ς: "σ" }
const MARKS = /\p{M}/gu
const MARK = /\p{M}/u
const ENDS_WITH_WORD_CHAR = /[\p{L}\p{N}]$/u

interface Folded {
    text: string
    /** For each unit of `text`, the range of the original code point it came from. */
    starts: number[]
    ends: number[]
}

function foldChar(ch: string): string {
    if (APOSTROPHES.has(ch)) return ""
    const bare = ch.normalize("NFKD").replace(MARKS, "").toLowerCase()
    return Array.from(bare, (c) => BASE_LETTERS[c] ?? c).join("")
}

function fold(text: string): Folded {
    let folded = ""
    const starts: number[] = []
    const ends: number[] = []
    let at = 0
    for (const ch of text) {
        const piece = foldChar(ch)
        for (let i = 0; i < piece.length; i++) {
            starts.push(at)
            ends.push(at + ch.length)
        }
        folded += piece
        at += ch.length
    }
    return { text: folded, starts, ends }
}

// A leading `#` names a channel and `@` a person: neither is part of the name.
function needleOf(query: string): string {
    return fold(query.trim().replace(/^[#@]/, "")).text
}

interface Found {
    match: TextMatch
    atWordStart: boolean
}

function foundAt(text: string, folded: Folded, at: number, length: number): Found {
    let end = folded.ends[at + length - 1]
    for (const ch of text.slice(end)) {
        if (!MARK.test(ch)) break
        end += ch.length
    }
    const atWordStart = !ENDS_WITH_WORD_CHAR.test(folded.text.slice(0, at))
    return { match: { start: folded.starts[at], end }, atWordStart }
}

function find(text: string, needle: string): Found | null {
    if (!needle) return null
    const folded = fold(text)
    let first: Found | null = null
    for (let at = folded.text.indexOf(needle); at >= 0; at = folded.text.indexOf(needle, at + 1)) {
        const found = foundAt(text, folded, at, needle.length)
        if (found.atWordStart) return found
        first ??= found
    }
    return first
}

/**
 * Where `query`, as typed in the search field, is in `text` — case, diacritics, ʻokina and
 * apostrophes aside: the first match at a word's start, else the first one.
 */
export function matchText(text: string, query: string): TextMatch | null {
    return find(text, needleOf(query))?.match ?? null
}

function ranked<T>(items: T[], texts: (item: T) => [SearchField, string][], needle: string): SearchHit<T>[] {
    if (!needle) return []
    const hits = items.flatMap((item) => {
        const matches = texts(item).flatMap(([field, text]) => {
            const found = find(text, needle)
            return found ? [{ hit: { item, field, text, match: found.match }, atWordStart: found.atWordStart }] : []
        })
        const best = matches.find((m) => m.atWordStart) ?? matches[0]
        return best ? [best] : []
    })
    return hits.sort((a, b) => Number(b.atWordStart) - Number(a.atWordStart)).map(({ hit }) => hit)
}

/**
 * The rows matching `query`, each on its best text: the first matching at a word's start, else
 * the first matching at all. Rows matching at a word's start come first, then each list keeps
 * its order.
 */
export function searchConversations<
    F extends { name: string; address: string },
    C extends { kind: "dm" | "group"; displayName: string; address: string; memberNames: string[] },
    S extends { name: string },
    Ch extends { name: string },
>(sources: SearchSources<F, C, S, Ch>, query: string): SearchResults<F, C, S, Ch> {
    const needle = needleOf(query)
    const friends = new Set(sources.friends.map((f) => f.address))
    const places: Place<S, Ch>[] = [
        ...sources.servers.map(({ server }) => ({ kind: "server" as const, server })),
        ...sources.servers.flatMap(({ server, channels }) =>
            channels.map((channel) => ({ kind: "channel" as const, server, channel })),
        ),
    ]
    return {
        people: ranked(sources.friends, (f) => [["name", f.name], ["address", f.address]], needle),
        conversations: ranked(
            sources.conversations.filter((c) => c.kind === "group" || !friends.has(c.address)),
            (c): [SearchField, string][] =>
                c.kind === "group"
                    ? [["name", c.displayName], ...c.memberNames.map((n): [SearchField, string] => ["member", n])]
                    : [["name", c.displayName], ["address", c.address]],
            needle,
        ),
        places: ranked(places, (p) => [["name", p.kind === "server" ? p.server.name : p.channel.name]], needle),
    }
}
