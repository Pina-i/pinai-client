import type { OidcConfig, UserProfile } from "@/domain/models/auth"

export const AUTH_PORT = "AUTH_PORT"

export interface IAuthPort {
    /** Fetch OIDC discovery document from the IdP. */
    discoverConfig(idpUrl: string): Promise<OidcConfig>

    /** Exchange an authorization code + PKCE verifier for an access token. */
    exchangeCode(params: {
        tokenEndpoint: string
        code: string
        codeVerifier: string
        redirectUri: string
        clientId: string
    }): Promise<string>

    /** Fetch the authenticated user's profile using an access token. */
    fetchUserInfo(userinfoEndpoint: string, accessToken: string): Promise<UserProfile>
}
