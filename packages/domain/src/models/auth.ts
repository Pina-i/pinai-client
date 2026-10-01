import type { ActorUri } from "./e2ee"
import type { ContactPolicy } from "./block"

/** Closed enum of pronoun choices the IdP currently supports. */
export type Pronouns = "he" | "she" | "non-binary"

export interface UserProfile {
    sub: string
    email: string
    email_verified: boolean
    totp_enabled: boolean
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
    authorization_endpoint: string
    token_endpoint: string
    userinfo_endpoint: string
}

export interface AuthSession {
    accessToken: string
    user: UserProfile
    idpUrl: string
}

/**
 * True when the access token is present and its `exp` claim is still in the
 * future. The signature is deliberately not verified — that is the IdP's
 * job; this is the client deciding whether it still has a usable session.
 *
 * Platform note: `atob` is assumed. React Native polyfills it, but when the
 * crypto helpers move to a shared package this should switch to the same
 * base64url decoder they use.
 */
export function isTokenValid(token: string | null): boolean {
    if (!token) return false
    try {
        const payload = JSON.parse(
            atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        ) as { exp?: number }
        return typeof payload.exp === "number" && Date.now() / 1000 < payload.exp
    } catch {
        return false
    }
}
