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

/**
 * PKCE material. Randomness and SHA-256 are platform services — WebCrypto in
 * the browser, a native or pure-JS provider elsewhere — so the use cases take
 * them through a port rather than importing an implementation.
 */
export interface IPkcePort {
    /** Cryptographically random code verifier (64 URL-safe chars). */
    generateCodeVerifier(): string

    /** S256 challenge: BASE64URL(SHA-256(verifier)). `plain` is never used. */
    computeCodeChallenge(verifier: string): Promise<string>

    /** Random URL-safe string of the given byte length — `state` and `nonce`. */
    generateRandomString(byteLength: number): string
}

/** Everything the OIDC round-trip has to survive leaving the app. */
export type AuthSessionKey =
    | "post_login_redirect"
    | "pkce_verifier"
    | "pkce_state"
    | "pkce_nonce"
    | "idp_url"
    | "token_endpoint"
    | "userinfo_endpoint"

export const AUTH_SESSION_KEYS: readonly AuthSessionKey[] = [
    "post_login_redirect",
    "pkce_verifier",
    "pkce_state",
    "pkce_nonce",
    "idp_url",
    "token_endpoint",
    "userinfo_endpoint",
]

/**
 * Scratch space that outlives the hand-off to the IdP but not the session.
 * `sessionStorage` on the web; secure storage on a device, where the app may
 * be evicted from memory while the system auth sheet is open.
 *
 * Deliberately synchronous: every backing store worth using here offers a
 * synchronous read, and it keeps the values usable during render.
 */
export interface IAuthSessionStore {
    get(key: AuthSessionKey): string | null
    set(key: AuthSessionKey, value: string): void
    remove(key: AuthSessionKey): void
    /** Drop every {@link AuthSessionKey} — used when a flow is abandoned. */
    clear(): void
}

/**
 * Where the app sits in the world, and how it hands control to the IdP.
 *
 * On the web these are document locations and `navigateTo` never returns —
 * the page is replaced. A native implementation returns a deep link for
 * {@link callbackUrl} and opens a system auth session in `navigateTo`,
 * feeding the resulting callback URL back into `handleCallbackUseCase`.
 */
export interface IAuthNavigationPort {
    /** The `redirect_uri` this platform is registered for. */
    callbackUrl(): string

    /** Where the IdP should send the user after `/logout`. */
    postLogoutUrl(): string

    /** The location to return to once login completes. */
    currentLocation(): string

    /** Hand control to the IdP's `/authorize` or `/logout` endpoint. */
    navigateTo(url: string): void
}

/**
 * The platform half of the OIDC flow, bundled so use cases take one argument
 * instead of four. Each app composes its own in the IoC container.
 */
export interface AuthPlatform {
    /** OIDC client id this build is registered under (per platform). */
    clientId: string
    pkce: IPkcePort
    session: IAuthSessionStore
    navigation: IAuthNavigationPort
}
