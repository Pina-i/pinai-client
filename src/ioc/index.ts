import { OidcAdapter } from "@/adapters/auth/oidc.adapter"
import { SocialApiAdapter } from "@/adapters/social/social-api.adapter"
import { IdpWsAdapter } from "@/adapters/ws/idp-ws.adapter"
import type { IAuthPort } from "@/domain/ports/auth.port"
import type { ISocialPort } from "@/domain/ports/social.port"
import type { IWsPort } from "@/domain/ports/ws.port"

/**
 * Singleton instances.
 * Replace with tsyringe container when DI is added.
 */
const authPort: IAuthPort = new OidcAdapter()
const socialPort: ISocialPort = new SocialApiAdapter()
const wsPort: IWsPort = new IdpWsAdapter()

export function getAuthPort(): IAuthPort {
    return authPort
}

export function getSocialPort(): ISocialPort {
    return socialPort
}

export function getWsPort(): IWsPort {
    return wsPort
}
