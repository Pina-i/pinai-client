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
 * Always use this helper at the UI boundary; never hand-parse one form into
 * the other elsewhere. Internal code paths and API requests should keep
 * passing the URI through unchanged.
 */
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

/**
 * Inverse of {@link actorUriToAddress}: `username@host` → canonical
 * `<scheme>://<host>/users/<username>`. Used when we hold an address
 * (typically a route param like `/dm/alice@idp.alice.com`) but need
 * to call an API that only speaks actor URIs.
 *
 * The scheme is borrowed from `localIssuer` so dev (everyone on
 * `http://localhost:*`) and prod (everyone on `https://`) both work
 * without a per-host registry. Mirrors the same heuristic the IdP's
 * `federation::delivery::resolve_remote_actor` uses server-side.
 *
 * Returns `null` for an unparseable input rather than guessing.
 */
export function addressToActorUri(address: string, localIssuer: string): string | null {
    const at = address.lastIndexOf("@")
    if (at <= 0 || at === address.length - 1) return null
    const handle = address.slice(0, at)
    const host = address.slice(at + 1)
    if (!handle || !host) return null
    const scheme = localIssuer.startsWith("https") ? "https" : "http"
    return `${scheme}://${host}/users/${handle}`
}
