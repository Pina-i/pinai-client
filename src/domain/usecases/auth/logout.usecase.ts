/**
 * Clears the local session and redirects the browser to the IdP logout endpoint.
 * The IdP will invalidate the session cookie and redirect back to the app.
 *
 * `clearSession` is injected by the caller so the use case stays free of
 * any store or framework dependency.
 */
export function logoutUseCase(idpUrl: string, clearSession: () => void): void {
    clearSession()
    const postLogoutRedirect = encodeURIComponent(window.location.origin)
    window.location.href = `${idpUrl}/logout?post_logout_redirect_uri=${postLogoutRedirect}`
}
