/**
 * An identity provider as the landing page knows it before any sign-in: the
 * address typed, what the instance says about itself (NodeInfo), and the
 * instances this device signed in to.
 */

export interface InstanceAddress {
    /** `scheme://host[:port]` — what a sign-in is started against. */
    origin: string
    host: string
}

// A host with a dot and a top-level name, or with a port: `aotearoa.nz`, `localhost:8080`.
const ADDRESS_HOST = /^[a-z0-9.-]+(\.[a-z]{2,}|:\d+)$/
const LOOPBACK_HOST = /^(localhost|127(\.\d{1,3}){3})(:\d+)?$/

// A loopback instance is a development one, served over plain http.
function assumedScheme(host: string): "http" | "https" {
    return LOOPBACK_HOST.test(host) ? "http" : "https"
}

/** What the user typed, as an instance to sign in to; `null` while it can't be one. */
export function instanceAddress(input: string): InstanceAddress | null {
    const raw = input.trim().toLowerCase()
    if (!raw) return null
    const absolute = /^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `${assumedScheme(raw.split("/")[0])}://${raw}`
    let url: URL
    try {
        url = new URL(absolute)
    } catch {
        return null
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null
    if (!ADDRESS_HOST.test(url.host)) return null
    return { origin: url.origin, host: url.host }
}

/**
 * How the app opens on `?instance=`, where an invitation's sign-up and a reset link send people:
 * `none` for no address, or one that can't be one (the landing as usual); `here` for the instance
 * the app signs in to (on to the app); `pick` for the landing with it filled in, `leaving` the
 * other instance the app signed in to.
 */
export type InstanceArrival =
    | { kind: "none" }
    | { kind: "here" }
    | { kind: "pick"; address: InstanceAddress; leaving: boolean }

export function instanceArrival(asked: string | null, signedInTo: string | null): InstanceArrival {
    const address = asked === null ? null : instanceAddress(asked)
    if (!address) return { kind: "none" }
    if (signedInTo === null) return { kind: "pick", address, leaving: false }
    if (sameInstance(address, signedInTo)) return { kind: "here" }
    return { kind: "pick", address, leaving: true }
}

/** One instance by its authority, `host[:port]`: a scheme written differently names the same one. */
export function sameInstance(address: InstanceAddress, other: string): boolean {
    return instanceAddress(other)?.host === address.host
}

/** How an address is written back into the field: its bare host when the scheme is the one assumed. */
export function displayAddress(address: InstanceAddress): string {
    return `${assumedScheme(address.host)}://${address.host}` === address.origin ? address.host : address.origin
}

/** The schemas this client reads, newest first. */
export const NODEINFO_SCHEMAS = [
    "http://nodeinfo.diaspora.software/ns/schema/2.1",
    "http://nodeinfo.diaspora.software/ns/schema/2.0",
] as const

/** What NodeInfo's `software.name` says on a Pīna'i identity provider. */
export const PINAI_SOFTWARE = "pinai"

export interface InstanceInfo {
    name: string
    /** Accounts on the instance, when it says. */
    users: number | null
    openRegistrations: boolean
}

function record(raw: unknown): Record<string, unknown> {
    return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
}

/** The document `/.well-known/nodeinfo` links to, in the newest schema it offers; `null` without one. */
export function nodeInfoHref(links: unknown, base: string): string | null {
    const listed = record(links).links
    const entries = Array.isArray(listed) ? listed.map(record) : []
    for (const schema of NODEINFO_SCHEMAS) {
        const href = entries.find((entry) => entry.rel === schema && typeof entry.href === "string")?.href
        if (typeof href !== "string") continue
        try {
            const url = new URL(href, base)
            if (url.protocol === "https:" || url.protocol === "http:") return url.href
        } catch {
            // Not a URL: try an older schema.
        }
    }
    return null
}

/** A NodeInfo document, as long as a Pīna'i identity provider wrote it. */
export function parseNodeInfo(raw: unknown, address: InstanceAddress): InstanceInfo | null {
    const doc = record(raw)
    if (record(doc.software).name !== PINAI_SOFTWARE) return null
    const name = record(doc.metadata).nodeName
    const total = record(record(doc.usage).users).total
    return {
        name: typeof name === "string" && name.trim() ? name.trim() : address.host,
        users: typeof total === "number" && Number.isInteger(total) && total >= 0 ? total : null,
        // Required by the schema; a document without it is not taken for a closed instance.
        openRegistrations: doc.openRegistrations !== false,
    }
}

/** `1 person`, `1,204 people`. */
export function peopleCount(count: number): string {
    return `${count.toLocaleString("en")} ${count === 1 ? "person" : "people"}`
}

/** The landing's resolution line: `✓ resolved · Aotearoa · 1,204 people · invite only`. */
export function describeInstance(info: InstanceInfo): string {
    const parts = ["✓ resolved", info.name]
    if (info.users) parts.push(peopleCount(info.users))
    if (!info.openRegistrations) parts.push("invite only")
    return parts.join(" · ")
}

export const MAX_RECENT_INSTANCES = 3

/** The stored list of recent instances, cleaned: valid origins, once each, newest first. */
export function parseRecentInstances(raw: unknown): InstanceAddress[] {
    const stored = Array.isArray(raw) ? raw : []
    const addresses: InstanceAddress[] = []
    for (const entry of stored) {
        const address = typeof entry === "string" ? instanceAddress(entry) : null
        if (address && !addresses.some((known) => known.origin === address.origin)) addresses.push(address)
    }
    return addresses.slice(0, MAX_RECENT_INSTANCES)
}

/** The list after a sign-in to `origin`: it moves to the front, the oldest falls off. */
export function addRecentInstance(recent: InstanceAddress[], address: InstanceAddress): InstanceAddress[] {
    return [address, ...recent.filter((known) => known.origin !== address.origin)].slice(0, MAX_RECENT_INSTANCES)
}
