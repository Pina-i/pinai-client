import type { IAuthPort } from "@/domain/ports/auth.port"
import type { OidcConfig, UserProfile } from "@/domain/models/auth"

export class OidcAdapter implements IAuthPort {
    async discoverConfig(idpUrl: string): Promise<OidcConfig> {
        const url = `${idpUrl.replace(/\/$/, "")}/.well-known/openid-configuration`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`)
        return res.json() as Promise<OidcConfig>
    }

    async exchangeCode(params: {
        tokenEndpoint: string
        code: string
        codeVerifier: string
        redirectUri: string
        clientId: string
    }): Promise<string> {
        const body = new URLSearchParams({
            grant_type: "authorization_code",
            code: params.code,
            code_verifier: params.codeVerifier,
            redirect_uri: params.redirectUri,
            client_id: params.clientId,
        })

        const res = await fetch(params.tokenEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
        })

        if (!res.ok) {
            const err = await res.json().catch(() => ({})) as { error_description?: string }
            throw new Error(err.error_description ?? `Token exchange failed: ${res.status}`)
        }

        const data = await res.json() as { access_token: string }
        return data.access_token
    }

    async fetchUserInfo(userinfoEndpoint: string, accessToken: string): Promise<UserProfile> {
        const res = await fetch(userinfoEndpoint, {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) throw new Error(`Userinfo fetch failed: ${res.status}`)
        return res.json() as Promise<UserProfile>
    }
}
