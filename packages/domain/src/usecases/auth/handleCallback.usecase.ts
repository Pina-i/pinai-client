import type { AuthPlatform, IAuthPort } from "../../ports/auth.port"
import type { CallbackResult } from "../../models/auth"

const ERROR_CODE = /^[a-z_]{1,64}$/

export async function handleCallbackUseCase(
    searchParams: URLSearchParams,
    authPort: IAuthPort,
    platform: AuthPlatform,
): Promise<CallbackResult> {
    const { session, navigation } = platform

    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    if (!code && error === null) throw new Error("Missing authorization code in callback")

    const storedState = session.get("pkce_state")
    if (!storedState || storedState !== state) {
        throw new Error("State mismatch — possible CSRF attack")
    }

    if (error !== null) {
        // The flow is over: nothing of it may be replayed. `idp_url` stays, so the landing offers it again.
        session.remove("pkce_verifier")
        session.remove("pkce_state")
        session.remove("pkce_nonce")
        session.remove("token_endpoint")
        session.remove("userinfo_endpoint")
        session.remove("revocation_endpoint")
        session.remove("client_id")
        session.remove("post_login_redirect")
        if (error === "access_denied") return { kind: "cancelled" }
        return { kind: "refused", error: ERROR_CODE.test(error) ? error : null }
    }

    const codeVerifier = session.get("pkce_verifier")
    const tokenEndpoint = session.get("token_endpoint")
    const userinfoEndpoint = session.get("userinfo_endpoint")
    const clientId = session.get("client_id")
    const revocationEndpoint = session.get("revocation_endpoint")

    const idpUrl = session.get("idp_url") ?? ""

    if (!code || !codeVerifier || !tokenEndpoint || !userinfoEndpoint || !clientId) {
        throw new Error("Missing PKCE session data — please restart login")
    }

    const { accessToken, refreshToken } = await authPort.exchangeCode({
        tokenEndpoint,
        code,
        codeVerifier,
        redirectUri: navigation.callbackUrl(),
        clientId,
    })
    platform.tokens.set({ refreshToken, tokenEndpoint, clientId, revocationEndpoint })

    const user = await authPort.fetchUserInfo(userinfoEndpoint, accessToken)

    // Clean up the scratch space — the verifier must be single-use.
    // `post_login_redirect` survives: the caller consumes it to restore
    // where the user was when the flow started.
    session.remove("pkce_verifier")
    session.remove("pkce_state")
    session.remove("pkce_nonce")
    session.remove("token_endpoint")
    session.remove("userinfo_endpoint")
    session.remove("revocation_endpoint")
    session.remove("client_id")

    return { kind: "signed-in", session: { accessToken, user, idpUrl } }
}
