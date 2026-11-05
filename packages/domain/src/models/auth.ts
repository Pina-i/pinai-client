import type { ActorUri } from "./e2ee"
import type { ContactPolicy } from "./block"

/** Closed enum of pronoun choices the IdP currently supports. */
export type Pronouns = "he" | "she" | "non-binary"

export interface UserProfile {
    sub: string
    email: string
    email_verified: boolean
    totp_enabled: boolean
    /** An admin of the instance the account is on. */
    admin: boolean
    preferred_username: string
    display_name: string | null
    address: string
    /**
     * Canonical ActivityPub actor URI — sourced from the IdP's
     * `/userinfo` response. Treat this as the single source of truth
     * for the local user's actor URI everywhere on the client; never
     * re-derive from `idpUrl` + `address`, since the browser's URL to
     * the IdP can differ from its configured DOMAIN.
     */
    actor_uri: ActorUri
    avatar_url?: string
    pronouns?: Pronouns | null
    bio?: string | null
    /**
     * The account settings document, raw — the IdP stores it without
     * interpreting it. Read it through `parseAccountSettings`.
     */
    settings?: unknown
    /** Who may message the account or add it to a group. */
    privacy?: { contact_policy: ContactPolicy }
}

export interface ProfilePatch {
    display_name: string
    pronouns: Pronouns | null
    bio: string
}

export interface OidcConfig {
    issuer: string
    authorization_endpoint: string
    token_endpoint: string
    userinfo_endpoint: string
    /** RFC 7009: where an app signs out by revoking its refresh token. */
    revocation_endpoint?: string
}

export interface AuthSession {
    accessToken: string
    user: UserProfile
    idpUrl: string
}

/**
 * How a sign-in came back. `cancelled` is the user's "Another home" on the
 * IdP (`access_denied`) — `returnTo` where they were, when they were signed in
 * there and only asked for the password again; `refused` is any other `error`
 * the IdP sent, its code kept only when it looks like one (RFC 6749 § 4.1.2.1),
 * never its description.
 */
export type CallbackResult =
    | { kind: "signed-in"; session: AuthSession }
    | { kind: "cancelled"; returnTo: string | null }
    | { kind: "refused"; error: string | null }

/** What `/token` answers: the access token, and the refresh token that renews it. */
export interface IssuedTokens {
    accessToken: string
    refreshToken: string
}

/**
 * A JWT's claims, unverified. The signature is deliberately not checked — that is the IdP's
 * job; this is the client reading what it was given.
 *
 * Platform note: `atob` is assumed. React Native polyfills it, but when the
 * crypto helpers move to a shared package this should switch to the same
 * base64url decoder they use.
 */
function claimsOf(token: string): { iat?: number; exp?: number; auth_time?: number } | null {
    try {
        return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
            iat?: number
            exp?: number
            auth_time?: number
        }
    } catch {
        return null
    }
}

/**
 * True when the access token is present and its `exp` claim is still in the
 * future: the client deciding whether it still has a usable session.
 */
export function isTokenValid(token: string | null): boolean {
    if (!token) return false
    const exp = claimsOf(token)?.exp
    return typeof exp === "number" && Date.now() / 1000 < exp
}

/**
 * A sensitive action takes a password typed in the IdP's last 10 minutes; the client asks it again
 * from 9, so a request on its way doesn't arrive a moment too late.
 */
export const RECENT_SIGN_IN_MS = 9 * 60_000

/**
 * Whether the password was typed recently enough for a sensitive action, timed on the IdP's clock so
 * a device clock set wrong can't make it look old: its age when the token was issued (`iat −
 * auth_time`) plus the time since the token arrived, counted on this device's clock. Without that
 * arrival, either clock saying recent is taken, and the IdP's `401` settles the rest. A token
 * without `auth_time` isn't recent.
 */
export function signedInRecently(token: string | null, arrivedAt: number | null = null, now: number = Date.now()): boolean {
    const claims = token ? claimsOf(token) : null
    const authTime = claims?.auth_time
    if (typeof authTime !== "number") return false
    const ageAtIssue = typeof claims?.iat === "number" ? (claims.iat - authTime) * 1000 : null
    if (ageAtIssue !== null && arrivedAt !== null) return ageAtIssue + Math.max(0, now - arrivedAt) < RECENT_SIGN_IN_MS
    return now - authTime * 1000 < RECENT_SIGN_IN_MS || (ageAtIssue !== null && ageAtIssue < RECENT_SIGN_IN_MS)
}

/** An access token is renewed once this share of its lifetime has gone. */
export const RENEW_AT = 0.8

/**
 * How long after it arrived an access token is renewed, in ms: at {@link RENEW_AT} of its
 * lifetime, leaving the rest to retry a renewal that failed. Counted from its arrival rather
 * than its `iat`, so a device whose clock disagrees with the IdP's renews on time all the same.
 * `null` for a token whose lifetime can't be read.
 */
export function renewAfter(token: string): number | null {
    const claims = claimsOf(token)
    const iat = claims?.iat
    const exp = claims?.exp
    if (typeof iat !== "number" || typeof exp !== "number" || exp <= iat) return null
    return (exp - iat) * RENEW_AT * 1000
}
