/** The scheme every IdP's desktop client document lists its callback under. */
export const SCHEME = "io.github.pina-i"

export type Route =
    | { kind: "allow" }
    /** The IdP's answer: the app's `/callback` takes it, in the same window. */
    | { kind: "callback"; path: string }
    | { kind: "deny" }

/**
 * Where the app's window may go: its own pages, and the pages of the IdP it is signing in to.
 * The IdP's answer to the desktop callback — a redirect after the sign-in, or "← Another home"
 * — loads the app's `/callback`; anything else stays out.
 */
export function route(to: string, app: string, signingInTo: string | null): Route {
    let url: URL
    try {
        url = new URL(to)
    } catch {
        return { kind: "deny" }
    }
    if (url.protocol === `${SCHEME}:`) {
        return url.pathname === "/callback" ? { kind: "callback", path: `/callback${url.search}` } : { kind: "deny" }
    }
    if (url.origin === new URL(app).origin) return { kind: "allow" }
    if (signingInTo !== null && url.origin === signingInTo) return { kind: "allow" }
    return { kind: "deny" }
}
