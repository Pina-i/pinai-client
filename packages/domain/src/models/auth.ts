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
function claimsOf(token: string): { iat?: number; exp?: number } | null {
    try {
        return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
            iat?: number
            exp?: number
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
