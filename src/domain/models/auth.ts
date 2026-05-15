import type { ActorUri } from "@/domain/models/e2ee"

/** Closed enum of pronoun choices the IdP currently supports. */
export type Pronouns = "he" | "she" | "non-binary"

export interface UserProfile {
    sub: string
    email: string
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
