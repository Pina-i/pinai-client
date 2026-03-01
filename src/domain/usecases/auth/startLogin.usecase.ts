import type { IAuthPort } from "@/domain/ports/auth.port"
import { generateCodeVerifier, computeCodeChallenge, generateRandomString } from "@/adapters/auth/pkce"

const CLIENT_ID = "web-client"
const REDIRECT_URI = `${window.location.origin}/callback`

export async function startLoginUseCase(idpUrl: string, authPort: IAuthPort): Promise<void> {
    const config = await authPort.discoverConfig(idpUrl)

    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await computeCodeChallenge(codeVerifier)
    const state = generateRandomString(16)
    const nonce = generateRandomString(16)

    // Persist across the redirect — sessionStorage is cleared when the tab closes
    sessionStorage.setItem("pkce_verifier", codeVerifier)
    sessionStorage.setItem("pkce_state", state)
    sessionStorage.setItem("pkce_nonce", nonce)
    sessionStorage.setItem("idp_url", idpUrl)
    sessionStorage.setItem("token_endpoint", config.token_endpoint)
    sessionStorage.setItem("userinfo_endpoint", config.userinfo_endpoint)

    const params = new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: "openid profile email",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        nonce,
    })

    window.location.href = `${config.authorization_endpoint}?${params.toString()}`
}
