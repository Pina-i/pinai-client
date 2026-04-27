import { OidcAdapter } from "@/adapters/auth/oidc.adapter"
import { SocialApiAdapter } from "@/adapters/social/social-api.adapter"
import { DmApiAdapter } from "@/adapters/dm/dm-api.adapter"
import { IdpWsAdapter } from "@/adapters/ws/idp-ws.adapter"
import { PresenceApiAdapter } from "@/adapters/presence/presence-api.adapter"
import type { IAuthPort } from "@/domain/ports/auth.port"
import type { ISocialPort } from "@/domain/ports/social.port"
import type { IDmPort } from "@/domain/ports/dm.port"
import type { IWsPort } from "@/domain/ports/ws.port"
import type { IPresencePort } from "@/domain/ports/presence.port"

/**
 * Singleton instances.
 * Replace with tsyringe container when DI is added.
 */
const authPort: IAuthPort = new OidcAdapter()
const socialPort: ISocialPort = new SocialApiAdapter()
const dmPort: IDmPort = new DmApiAdapter()
const wsPort: IWsPort = new IdpWsAdapter()
const presencePort: IPresencePort = new PresenceApiAdapter()

export function getAuthPort(): IAuthPort {
    return authPort
}

export function getSocialPort(): ISocialPort {
    return socialPort
}

export function getDmPort(): IDmPort {
    return dmPort
}

export function getWsPort(): IWsPort {
    return wsPort
}

export function getPresencePort(): IPresencePort {
    return presencePort
}
