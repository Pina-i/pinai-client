import type { AuthPlatform, IAuthPort } from "../../ports/auth.port"

/**
 * Everything a sign-in needs before the browser leaves: discovery, PKCE, the
 * scratch space the callback reads. Resolves to the `/authorize` URL to go to.
 */
export async function prepareLoginUseCase(
    idpUrl: string,
    authPort: IAuthPort,
    platform: AuthPlatform,
): Promise<string> {
    const { pkce, session, navigation } = platform
    const config = await authPort.discoverConfig(idpUrl)
    const clientId = platform.clientId(config.issuer)

    const codeVerifier = pkce.generateCodeVerifier()
    const codeChallenge = await pkce.computeCodeChallenge(codeVerifier)
    const state = pkce.generateRandomString(16)
    const nonce = pkce.generateRandomString(16)

    // Has to survive the hand-off to the IdP, but not the session.
    session.set("post_login_redirect", navigation.currentLocation())
    session.set("pkce_verifier", codeVerifier)
    session.set("pkce_state", state)
    session.set("pkce_nonce", nonce)
    session.set("idp_url", idpUrl)
    session.set("token_endpoint", config.token_endpoint)
    session.set("userinfo_endpoint", config.userinfo_endpoint)
    session.set("client_id", clientId)
    if (config.revocation_endpoint) session.set("revocation_endpoint", config.revocation_endpoint)
    else session.remove("revocation_endpoint")

    const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: navigation.callbackUrl(),
        // An app holding its own session asks to keep it on the device: the IdP opens it an app session.
        scope: platform.browserSession ? "openid profile email" : "openid profile email offline_access",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        nonce,
    })
    if (!platform.browserSession) params.set("prompt", "login")
    const appearance = platform.appearance()
    if (appearance) {
        params.set("theme", appearance.theme)
        params.set("motif", appearance.motif)
    }

    // Use idpUrl directly rather than config.authorization_endpoint. The discovery
    // doc returns URLs based on the server's DOMAIN (e.g. host.docker.internal:8080),
    // which may differ from what the user configured (e.g. localhost:8080). Navigating
    // to a different origin would orphan the session cookie, breaking silent refresh.
    return `${idpUrl.replace(/\/$/, "")}/authorize?${params.toString()}`
}

export async function startLoginUseCase(
    idpUrl: string,
    authPort: IAuthPort,
    platform: AuthPlatform,
): Promise<void> {
    platform.navigation.navigateTo(await prepareLoginUseCase(idpUrl, authPort, platform))
}
