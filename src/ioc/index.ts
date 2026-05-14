import { OidcAdapter } from "@/adapters/auth/oidc.adapter"
import { DeviceDirectoryApiAdapter } from "@/adapters/device-directory/device-directory-api.adapter"
import { E2eeAdapter } from "@/adapters/e2ee/e2ee.adapter"
import { HistoryArchiveAdapter } from "@/adapters/e2ee/history-archive.adapter"
import { HistoryArchiveApiAdapter } from "@/adapters/e2ee/history-archive-api.adapter"
import { NobleIdentityAdapter } from "@/adapters/e2ee/identity.adapter"
import { KeyDirectoryApiAdapter } from "@/adapters/e2ee/key-directory.adapter"
import { MlsAdapter } from "@/adapters/e2ee/mls.adapter"
import { NobleRecoveryAdapter } from "@/adapters/e2ee/recovery.adapter"
import { JwksCacheAdapter } from "@/adapters/jwks/jwks-cache.adapter"
import { SocialApiAdapter } from "@/adapters/social/social-api.adapter"
import { DmApiAdapter } from "@/adapters/dm/dm-api.adapter"
import { IdpWsAdapter } from "@/adapters/ws/idp-ws.adapter"
import { PresenceApiAdapter } from "@/adapters/presence/presence-api.adapter"
import { UserApiAdapter } from "@/adapters/user/user-api.adapter"
import { getSharedE2eeStorage } from "@/store/store"
import type { IAuthPort } from "@/domain/ports/auth.port"
import type { IDeviceDirectoryPort } from "@/domain/ports/device-directory.port"
import type { IE2eePort } from "@/domain/ports/e2ee.port"
import type { IHistoryArchivePort } from "@/domain/ports/history-archive.port"
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
const deviceDirectoryPort: IDeviceDirectoryPort = new DeviceDirectoryApiAdapter()

// Phase 7 — Layer A peer-credential verification + Layer B history-archive
// crypto and REST surface. Held as singletons alongside the other
// E2EE plumbing so the per-issuer JWKS cache + in-memory HAK persist
// across calls.
const jwksCache = new JwksCacheAdapter()
const historyArchivePort: IHistoryArchivePort = new HistoryArchiveApiAdapter()
const historyArchiveCrypto = new HistoryArchiveAdapter()

// E2EE crypto core (Phase 4b foundation). Held as one set of singletons
// — the MlsAdapter owns in-memory MLS state that has to live for the
// session, so re-construction would lose every joined group.
//
// The storage adapter is shared with the Zustand persist middleware
// (constructed up in `store/store.ts`) so both reuse the same
// non-extractable AES-256-GCM device key for at-rest encryption.
//
// Phase 7 — the `onPlaintextRestored` callback is wired here (rather than
// inside the adapter) so the adapter stays framework-agnostic. The Phase 5
// rip-out will pass a real callback that pushes into the dm slice.
const e2eePort: IE2eePort = new E2eeAdapter(
    new NobleIdentityAdapter(),
    new MlsAdapter(),
    getSharedE2eeStorage(),
    new KeyDirectoryApiAdapter(),
    new NobleRecoveryAdapter(),
    historyArchivePort,
    historyArchiveCrypto,
    (_conversationId, _messageId, _plaintext) => {
        // Phase 5 will replace this stub with a real dm-slice push.
        // For now the restore use case is functional but messages don't
        // actually reach the UI store.
        // eslint-disable-next-line no-console
        console.debug("[history-restore] plaintext restored (no UI sink wired yet)")
    },
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

export function getDeviceDirectoryPort(): IDeviceDirectoryPort {
    return deviceDirectoryPort
}

export function getJwksCache(): JwksCacheAdapter {
    return jwksCache
}

export function getHistoryArchivePort(): IHistoryArchivePort {
    return historyArchivePort
}
