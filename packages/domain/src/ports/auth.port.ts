import type { IssuedTokens, OidcConfig, UserProfile } from "../models/auth"
import type { AppearanceHints } from "../models/user-settings"

export const AUTH_PORT = "AUTH_PORT"

export interface IAuthPort {
    /** Fetch OIDC discovery document from the IdP. */
    discoverConfig(idpUrl: string): Promise<OidcConfig>

    /** Exchange an authorization code + PKCE verifier for the session's tokens. */
    exchangeCode(params: {
        tokenEndpoint: string
        code: string
        codeVerifier: string
        redirectUri: string
        clientId: string
    }): Promise<IssuedTokens>

    /**
     * Trade the refresh token for the next pair (RFC 6749 § 6). `null` when the IdP refused it:
     * the session is over. Rejects when the IdP couldn't be reached or failed — the token is then
     * still good to present again, within the minute the IdP allows for a lost answer.
     */
    refresh(params: { tokenEndpoint: string; clientId: string; refreshToken: string }): Promise<IssuedTokens | null>

    /** Revoke the refresh token, and its session with it (RFC 7009). */
    revoke(params: { revocationEndpoint: string; clientId: string; refreshToken: string }): Promise<void>

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
    | "revocation_endpoint"
    | "client_id"

export const AUTH_SESSION_KEYS: readonly AuthSessionKey[] = [
    "post_login_redirect",
    "pkce_verifier",
    "pkce_state",
    "pkce_nonce",
    "idp_url",
    "token_endpoint",
    "userinfo_endpoint",
    "revocation_endpoint",
    "client_id",
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

/** The refresh token a session renews with: where it goes, and the client it was issued to. */
export interface HeldRefreshToken {
    refreshToken: string
    tokenEndpoint: string
    clientId: string
    /** Where it is revoked at sign-out; `null` when the IdP names no such endpoint. */
    revocationEndpoint: string | null
}

/**
 * Where the refresh token waits between renewals: memory on the web, never web storage, where
 * any script on the page could read it; the OS keychain on a device.
 */
export interface ISessionTokenStore {
    set(held: HeldRefreshToken): void
    /** The token, removed: a renewal holds it until it puts back the next one. */
    take(): HeldRefreshToken | null
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
    /**
     * This build's client at the IdP whose `issuer` it is: the web deployment's own document, the
     * same at every IdP; the desktop app's, which every IdP describes itself.
     */
    clientId(issuer: string): string
    /**
     * The session lives in this browser, behind the IdP's cookie: `/authorize` signs in again
     * silently, and the IdP's `/logout` ends it. False for an app that holds a session of its own
     * through its refresh token — the desktop: it asks to stay signed in (`offline_access`, an
     * app session of its own), asks the password each time (`prompt=login`) so the user can pick
     * another account, and signs out by revoking its token.
     */
    browserSession: boolean
    pkce: IPkcePort
    session: IAuthSessionStore
    tokens: ISessionTokenStore
    navigation: IAuthNavigationPort
    /** What the IdP's sign-in pages should paint, read where this platform keeps the appearance. */
    appearance(): AppearanceHints | null
}
