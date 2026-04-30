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
