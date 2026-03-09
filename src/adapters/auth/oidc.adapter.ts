import type { IAuthPort } from "@/domain/ports/auth.port"
import type { OidcConfig, UserProfile } from "@/domain/models/auth"

/** Parse a JSON response, throwing a clear error if the body is not valid JSON. */
async function parseJson<T>(res: Response, context: string): Promise<T> {
    const contentType = res.headers.get("content-type") ?? ""
    if (!contentType.includes("json")) {
        throw new Error(`${context}: expected JSON but got ${contentType || "unknown content type"} — is the IdP URL correct?`)
    }
    return res.json() as Promise<T>
}

export class OidcAdapter implements IAuthPort {
    async discoverConfig(idpUrl: string): Promise<OidcConfig> {
        const url = `${idpUrl.replace(/\/$/, "")}/.well-known/openid-configuration`
        const res = await fetch(url, {
            headers: { Accept: "application/json" },
        })
        if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`)
        return parseJson<OidcConfig>(res, "OIDC discovery")
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
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: body.toString(),
        })

        if (!res.ok) {
            const err = await res.json().catch(() => ({})) as { error_description?: string }
            throw new Error(err.error_description ?? `Token exchange failed: ${res.status}`)
        }

        const data = await parseJson<{ access_token: string }>(res, "Token exchange")
        return data.access_token
    }

    async fetchUserInfo(userinfoEndpoint: string, accessToken: string): Promise<UserProfile> {
        const res = await fetch(userinfoEndpoint, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
            },
        })
        if (!res.ok) throw new Error(`Userinfo fetch failed: ${res.status}`)
        return parseJson<UserProfile>(res, "Userinfo")
    }
}
