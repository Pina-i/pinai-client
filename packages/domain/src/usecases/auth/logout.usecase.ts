import type { AuthPlatform } from "../../ports/auth.port"

/**
 * Clears the local session and hands the user to the IdP logout endpoint.
 * The IdP ends the session — its refresh tokens with it — and sends them back to the app.
 *
 * `clearSession` is injected by the caller so the use case stays free of
 * any store or framework dependency; `platform` supplies the return URL and
 * the hand-off, which differ per platform.
 */
export function logoutUseCase(
    idpUrl: string,
    clearSession: () => void,
    platform: AuthPlatform,
): void {
    clearSession()
    // An app's own session ends with its refresh token, revoked as it is cleared; the browser it
    // signed in through keeps its own.
    platform.tokens.clear()
    if (!platform.browserSession) {
        platform.navigation.navigateTo("/")
        return
    }
    // The IdP sends the browser back only to a URI this client's document lists.
    const params = new URLSearchParams({
        client_id: platform.clientId(idpUrl),
        post_logout_redirect_uri: platform.navigation.postLogoutUrl(),
    })
    platform.navigation.navigateTo(`${idpUrl}/logout?${params.toString()}`)
}
