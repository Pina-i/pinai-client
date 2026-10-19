import type { AuthPlatform } from "../../ports/auth.port"

/**
 * Clears the local session and hands the user to the IdP logout endpoint.
 * The IdP invalidates the session cookie and sends them back to the app.
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
    // The IdP sends the browser back only to a URI this client's document lists.
    const params = new URLSearchParams({
        client_id: platform.clientId,
        post_logout_redirect_uri: platform.navigation.postLogoutUrl(),
    })
    platform.navigation.navigateTo(`${idpUrl}/logout?${params.toString()}`)
}
