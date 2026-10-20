import ky, { HTTPError } from "ky"
import type { IAuthPort } from "@pinai/domain/ports/auth.port"
import type { IssuedTokens, OidcConfig, UserProfile } from "@pinai/domain/models/auth"

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
    }): Promise<IssuedTokens> {
        const body = new URLSearchParams({
            grant_type: "authorization_code",
            code: params.code,
            code_verifier: params.codeVerifier,
            redirect_uri: params.redirectUri,
            client_id: params.clientId,
        })

        try {
            return issued(await ky.post(params.tokenEndpoint, { body }).json<TokenAnswer>())
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error_description?: string }
                throw new Error(err.error_description ?? `Token exchange failed: ${error.response.status}`)
            }
            throw error
        }
    }

    async refresh(params: { tokenEndpoint: string; clientId: string; refreshToken: string }): Promise<IssuedTokens | null> {
        const body = new URLSearchParams({
            grant_type: "refresh_token",
            client_id: params.clientId,
            refresh_token: params.refreshToken,
        })
        // Not retried: a second presentation of a token the IdP rotated would be a reuse.
        const response = await ky.post(params.tokenEndpoint, { body, retry: 0, throwHttpErrors: false })
        if (response.ok) return issued(await response.json<TokenAnswer>())
        const err = await response.json<{ error?: string }>().catch(() => ({ error: undefined }))
        if (err.error === "invalid_grant" || err.error === "invalid_client") return null
        throw new Error(`Token refresh failed: ${response.status}`)
    }

    async revoke(params: { revocationEndpoint: string; clientId: string; refreshToken: string }): Promise<void> {
        const body = new URLSearchParams({
            client_id: params.clientId,
            token: params.refreshToken,
            token_type_hint: "refresh_token",
        })
        const response = await ky.post(params.revocationEndpoint, { body, retry: 0, throwHttpErrors: false })
        if (!response.ok) throw new Error(`Token revocation failed: ${response.status}`)
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

interface TokenAnswer {
    access_token: string
    refresh_token: string
}

function issued(answer: TokenAnswer): IssuedTokens {
    return { accessToken: answer.access_token, refreshToken: answer.refresh_token }
}
