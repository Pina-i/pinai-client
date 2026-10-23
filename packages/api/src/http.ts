import ky from "ky"

import { RECENT_SIGN_IN_REQUIRED } from "@pinai/domain/models/idp-error"

/** The new access token, or `null` when there is none to go again with. */
export type RenewAccessToken = () => Promise<string | null>

let renew: RenewAccessToken | null = null

/** What renews the session when the IdP refuses a bearer token: the refused request then goes once more. */
export function retryUnauthorizedWith(renewal: RenewAccessToken): void {
    renew = renewal
}

/**
 * `ky` for the IdP's bearer routes. A `401` renews the session and sends the request once more
 * with the new token — through plain `ky`, so a second refusal stands. Not one asking for the
 * password again: a renewal never brings a recent one.
 */
export const idp = ky.create({
    hooks: {
        afterResponse: [
            async (request, _options, response) => {
                if (response.status !== 401 || !renew) return
                if (!request.headers.get("Authorization")?.startsWith("Bearer ")) return
                if (response.headers.get("WWW-Authenticate")?.includes(RECENT_SIGN_IN_REQUIRED)) return
                const token = await renew()
                if (!token) return
                request.headers.set("Authorization", `Bearer ${token}`)
                return ky(request, { retry: 0, throwHttpErrors: false })
            },
        ],
    },
})
