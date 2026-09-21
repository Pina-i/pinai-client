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
    const postLogoutRedirect = encodeURIComponent(platform.navigation.postLogoutUrl())
    platform.navigation.navigateTo(`${idpUrl}/logout?post_logout_redirect_uri=${postLogoutRedirect}`)
}
