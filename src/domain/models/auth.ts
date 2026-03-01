export interface UserProfile {
    sub: string
    email: string
    preferred_username: string
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
