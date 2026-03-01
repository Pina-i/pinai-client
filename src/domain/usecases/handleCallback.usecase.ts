import type { IAuthPort } from "@/domain/ports/auth.port"
import type { AuthSession } from "@/domain/models/auth"

const CLIENT_ID = "web-client"

export async function handleCallbackUseCase(
    searchParams: URLSearchParams,
    authPort: IAuthPort,
): Promise<AuthSession> {
    const code = searchParams.get("code")
    const state = searchParams.get("state")

    if (!code) throw new Error("Missing authorization code in callback")

    const storedState = sessionStorage.getItem("pkce_state")
    if (!storedState || storedState !== state) {
        throw new Error("State mismatch — possible CSRF attack")
    }

    const codeVerifier = sessionStorage.getItem("pkce_verifier")
    const tokenEndpoint = sessionStorage.getItem("token_endpoint")
    const userinfoEndpoint = sessionStorage.getItem("userinfo_endpoint")

    const idpUrl = sessionStorage.getItem("idp_url") ?? ""

    if (!codeVerifier || !tokenEndpoint || !userinfoEndpoint) {
        throw new Error("Missing PKCE session data — please restart login")
    }

    const redirectUri = `${window.location.origin}/callback`

    const accessToken = await authPort.exchangeCode({
        tokenEndpoint,
        code,
        codeVerifier,
        redirectUri,
        clientId: CLIENT_ID,
    })

    const user = await authPort.fetchUserInfo(userinfoEndpoint, accessToken)

    // Clean up session storage — verifier must be single-use
    sessionStorage.removeItem("pkce_verifier")
    sessionStorage.removeItem("pkce_state")
    sessionStorage.removeItem("pkce_nonce")
    sessionStorage.removeItem("token_endpoint")
    sessionStorage.removeItem("userinfo_endpoint")

    return { accessToken, user, idpUrl }
}
