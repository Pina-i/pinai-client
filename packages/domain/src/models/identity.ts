import type { ActorUri } from "./e2ee"

/**
 * Identity-format helpers.
 *
 * The Pina'i federation has two strings naming the same person:
 * - **Actor URI** — `http(s)://<host>/users/<handle>` — the canonical AP form
 *   used by every API, the WebSocket, the database, Redis pub-sub, and the
 *   in-memory `PresenceStore`.
 * - **Address** — `<handle>@<host>` — the human-readable Mastodon-style form
 *   used in the UI (friends list, conversation header, route params).
 *
 * Always use these helpers at the UI boundary; never hand-parse one form into
 * the other elsewhere. The `ActorUri` brand makes the latter a compile error.
 */

/**
 * Mark a server-emitted string as an `ActorUri`. Use *only* on values
 * the IdP produced (userinfo, conversation rows, WS payloads, etc.) —
 * never on locally-constructed strings, otherwise you defeat the whole
 * point of branding the type.
 */
export function asActorUri(uri: string): ActorUri {
    return uri as ActorUri
}

export function actorUriToAddress(uri: string): string {
    try {
        const url = new URL(uri)
        const handle = url.pathname.split("/").filter(Boolean).at(-1) ?? uri
        return `${handle}@${url.host}`
    } catch {
        // Not a parseable URL — return the input unchanged so callers can
        // still use it as a stable map key.
        return uri
    }
}

/** `handle@host` → its two parts; an address without an `@` is all handle. */
export function addressParts(address: string): { handle: string; host: string } {
    const at = address.lastIndexOf("@")
    return at < 0 ? { handle: address, host: "" } : { handle: address.slice(0, at), host: address.slice(at + 1) }
}

/**
 * Inverse of {@link actorUriToAddress}: `username@host` → canonical
 * `<scheme>://<host>/users/<username>`. Used when we hold an address
 * (typically a route param like `/dm/alice@idp.alice.com`) but need
 * to call an API that only speaks actor URIs.
 *
 * Prefer reading the local user's actor URI from `store.user.actorUri`
 * (sourced from `/userinfo`) over building it here — the IdP's
 * canonical form is the source of truth and may differ from what
 * derivation produces if the browser reached the IdP via a different
 * host than its configured DOMAIN. This helper is the right tool for
 * *peers* whose address came from a route param or directory search.
 *
 * The scheme is borrowed from `localIssuer` so dev (everyone on
 * `http://localhost:*`) and prod (everyone on `https://`) both work
 * without a per-host registry.
 *
 * Returns `null` for an unparseable input rather than guessing.
 */
export function addressToActorUri(address: string, localIssuer: string): ActorUri | null {
    const at = address.lastIndexOf("@")
    if (at <= 0 || at === address.length - 1) return null
    const handle = address.slice(0, at)
    const host = address.slice(at + 1)
    if (!handle || !host) return null
    const scheme = localIssuer.startsWith("https") ? "https" : "http"
    return `${scheme}://${host}/users/${handle}` as ActorUri
}
