import { OidcAdapter } from "@/adapters/auth/oidc.adapter"
import { E2eeAdapter } from "@/adapters/e2ee/e2ee.adapter"
import { NobleIdentityAdapter } from "@/adapters/e2ee/identity.adapter"
import { KeyDirectoryApiAdapter } from "@/adapters/e2ee/key-directory.adapter"
import { MlsAdapter } from "@/adapters/e2ee/mls.adapter"
import { NobleRecoveryAdapter } from "@/adapters/e2ee/recovery.adapter"
import { SocialApiAdapter } from "@/adapters/social/social-api.adapter"
import { DmApiAdapter } from "@/adapters/dm/dm-api.adapter"
import { IdpWsAdapter } from "@/adapters/ws/idp-ws.adapter"
import { PresenceApiAdapter } from "@/adapters/presence/presence-api.adapter"
import { UserApiAdapter } from "@/adapters/user/user-api.adapter"
import { getSharedE2eeStorage } from "@/store/store"
import type { IAuthPort } from "@/domain/ports/auth.port"
import type { IE2eePort } from "@/domain/ports/e2ee.port"
import type { ISocialPort } from "@/domain/ports/social.port"
import type { IDmPort } from "@/domain/ports/dm.port"
import type { IWsPort } from "@/domain/ports/ws.port"
import type { IPresencePort } from "@/domain/ports/presence.port"
import type { IUserPort } from "@/domain/ports/user.port"

/**
 * Singleton instances.
 * Replace with tsyringe container when DI is added.
 */
const authPort: IAuthPort = new OidcAdapter()
const socialPort: ISocialPort = new SocialApiAdapter()
const dmPort: IDmPort = new DmApiAdapter()
const wsPort: IWsPort = new IdpWsAdapter()
const presencePort: IPresencePort = new PresenceApiAdapter()
const userPort: IUserPort = new UserApiAdapter()

// E2EE crypto core (Phase 4b foundation). Held as one set of singletons
// — the MlsAdapter owns in-memory MLS state that has to live for the
// session, so re-construction would lose every joined group.
//
// The storage adapter is shared with the Zustand persist middleware
// (constructed up in `store/store.ts`) so both reuse the same
// non-extractable AES-256-GCM device key for at-rest encryption.
const e2eePort: IE2eePort = new E2eeAdapter(
    new NobleIdentityAdapter(),
    new MlsAdapter(),
    getSharedE2eeStorage(),
    new KeyDirectoryApiAdapter(),
    new NobleRecoveryAdapter(),
)

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

export function getUserPort(): IUserPort {
    return userPort
}

export function getE2eePort(): IE2eePort {
    return e2eePort
}
