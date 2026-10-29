/** The scheme every IdP's desktop client document lists its callback under. */
export const SCHEME = "io.github.pina-i"

/**
 * The built app's address, which `app-scheme.ts` serves. Permanent: the app's storage — its E2EE
 * device, its message cache — lives under this origin, and another would start empty.
 */
export const APP_URL = "app://pinai/"

/**
 * The app's address: electron-vite's dev server while one runs, else the built renderer. A packaged
 * app never takes another, whatever its environment says: that page would get the bridge.
 */
export function appUrlFor(isPackaged: boolean, devServer: string | undefined): string {
    return (!isPackaged && devServer) || APP_URL
}

export type Route =
    | { kind: "allow" }
    /** The IdP's answer: the app's `/callback` takes it, in the same window. */
    | { kind: "callback"; path: string }
    | { kind: "deny" }

/**
 * Whether `url` is one of the app's own pages, `app` being the app's address: the same protocol
 * and host. Never by `URL.origin`, which Node gives as `"null"` for `app:` as for `data:` and
 * `about:`. Hosts compare case-insensitively, as Chromium lowercases a standard scheme's.
 */
export function isApp(url: string, app: string): boolean {
    let to: URL
    let base: URL
    try {
        to = new URL(url)
        base = new URL(app)
    } catch {
        return false
    }
    // No userinfo: Node reads "app://evil\@pinai/" as host pinai, Chromium as host evil.
    return (
        to.protocol === base.protocol &&
        to.username === "" &&
        to.password === "" &&
        to.host.toLowerCase() === base.host.toLowerCase()
    )
}

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
    if (isApp(to, app)) return { kind: "allow" }
    if (signingInTo !== null && url.origin === signingInTo) return { kind: "allow" }
    return { kind: "deny" }
}
