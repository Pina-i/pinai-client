import { OidcAdapter } from "@/adapters/auth/oidc.adapter"
import { SocialApiAdapter } from "@/adapters/social/social-api.adapter"
import type { IAuthPort } from "@/domain/ports/auth.port"
import type { ISocialPort } from "@/domain/ports/social.port"

/**
 * Singleton instances.
 * Replace with tsyringe container when DI is added.
 */
const authPort: IAuthPort = new OidcAdapter()
const socialPort: ISocialPort = new SocialApiAdapter()

export function getAuthPort(): IAuthPort {
    return authPort
}

export function getSocialPort(): ISocialPort {
    return socialPort
}
