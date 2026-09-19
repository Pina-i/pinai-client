import type { AuthPlatform, IAuthPort } from "@/domain/ports/auth.port"
import type { AuthSession } from "@/domain/models/auth"

export async function handleCallbackUseCase(
    searchParams: URLSearchParams,
    authPort: IAuthPort,
    platform: AuthPlatform,
): Promise<AuthSession> {
    const { clientId, session, navigation } = platform

    const code = searchParams.get("code")
    const state = searchParams.get("state")

    if (!code) throw new Error("Missing authorization code in callback")

    const storedState = session.get("pkce_state")
    if (!storedState || storedState !== state) {
        throw new Error("State mismatch — possible CSRF attack")
    }

    const codeVerifier = session.get("pkce_verifier")
    const tokenEndpoint = session.get("token_endpoint")
    const userinfoEndpoint = session.get("userinfo_endpoint")

    const idpUrl = session.get("idp_url") ?? ""

    if (!codeVerifier || !tokenEndpoint || !userinfoEndpoint) {
        throw new Error("Missing PKCE session data — please restart login")
    }

    const accessToken = await authPort.exchangeCode({
        tokenEndpoint,
        code,
        codeVerifier,
        redirectUri: navigation.callbackUrl(),
        clientId,
    })

    const user = await authPort.fetchUserInfo(userinfoEndpoint, accessToken)

    // Clean up the scratch space — the verifier must be single-use.
    // `post_login_redirect` survives: the caller consumes it to restore
    // where the user was when the flow started.
    session.remove("pkce_verifier")
    session.remove("pkce_state")
    session.remove("pkce_nonce")
    session.remove("token_endpoint")
    session.remove("userinfo_endpoint")

    return { accessToken, user, idpUrl }
}
