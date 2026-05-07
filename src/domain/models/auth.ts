/** Closed enum of pronoun choices the IdP currently supports. */
export type Pronouns = "he" | "she" | "non-binary"

export interface UserProfile {
    sub: string
    email: string
    preferred_username: string
    display_name: string | null
    address: string
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
