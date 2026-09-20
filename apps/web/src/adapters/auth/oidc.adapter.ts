import ky, { HTTPError } from "ky"
import type { IAuthPort } from "@pinai/domain/ports/auth.port"
import type { OidcConfig, UserProfile } from "@pinai/domain/models/auth"

export class OidcAdapter implements IAuthPort {
    async discoverConfig(idpUrl: string): Promise<OidcConfig> {
        const url = `${idpUrl.replace(/\/$/, "")}/.well-known/openid-configuration`
        try {
            return await ky.get(url).json<OidcConfig>()
        } catch (error) {
            if (error instanceof HTTPError) {
                throw new Error(`OIDC discovery failed: ${error.response.status}`)
            }
            throw error
        }
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

        try {
            const data = await ky.post(params.tokenEndpoint, { body }).json<{ access_token: string }>()
            return data.access_token
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error_description?: string }
                throw new Error(err.error_description ?? `Token exchange failed: ${error.response.status}`)
            }
            throw error
        }
    }

    async fetchUserInfo(userinfoEndpoint: string, accessToken: string): Promise<UserProfile> {
        try {
            return await ky.get(userinfoEndpoint, {
                headers: { Authorization: `Bearer ${accessToken}` },
            }).json<UserProfile>()
        } catch (error) {
            if (error instanceof HTTPError) {
                throw new Error(`Userinfo fetch failed: ${error.response.status}`)
            }
            throw error
        }
    }
}
