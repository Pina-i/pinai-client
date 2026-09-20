import type { AuthPlatform, IAuthPort } from "../../ports/auth.port"

export async function startLoginUseCase(
    idpUrl: string,
    authPort: IAuthPort,
    platform: AuthPlatform,
): Promise<void> {
    const { clientId, pkce, session, navigation } = platform
    const config = await authPort.discoverConfig(idpUrl)

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

    const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: navigation.callbackUrl(),
        scope: "openid profile email",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        nonce,
    })

    // Use idpUrl directly rather than config.authorization_endpoint. The discovery
    // doc returns URLs based on the server's DOMAIN (e.g. host.docker.internal:8080),
    // which may differ from what the user configured (e.g. localhost:8080). Navigating
    // to a different origin would orphan the session cookie, breaking silent refresh.
    navigation.navigateTo(`${idpUrl.replace(/\/$/, "")}/authorize?${params.toString()}`)
}
