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
import { getSharedE2eeStorage, useAppStore } from "@/store/store"
import type { ApplicationMessage, TextBody } from "@/domain/models/e2ee"
import type { Message } from "@/lib/types"
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

// JWKS cache + history-archive singletons live alongside the other E2EE
// plumbing — keeps the per-issuer JWKS and the in-memory History Archive
// Key persistent across calls.
const jwksCache = new JwksCacheAdapter()
const historyArchivePort: IHistoryArchivePort = new HistoryArchiveApiAdapter()
const historyArchiveCrypto = new HistoryArchiveAdapter()

// E2EE crypto core. Singletons — MlsAdapter owns session-scoped in-memory
// state, re-construction would lose every joined group. Storage is shared
// with the Zustand persist middleware so both reuse the same non-
// extractable AES-256-GCM device key.
const e2eePort: IE2eePort = new E2eeAdapter(
    new NobleIdentityAdapter(),
    new MlsAdapter(),
    getSharedE2eeStorage(),
    new KeyDirectoryApiAdapter(),
    new NobleRecoveryAdapter(),
    historyArchivePort,
    historyArchiveCrypto,
    (conversationId, messageId, plaintext) => {
        // Push restored archive entries into the dm slice as if MLS just
        // decrypted them. `plaintext` is the buffered ApplicationMessage JSON.
        try {
            const json = new TextDecoder().decode(plaintext)
            const app = JSON.parse(json) as ApplicationMessage
            if (app.kind !== "text") return // reactions/edits depend on having the target message in place
            const body = app.body as TextBody
            const message: Message = {
                id: messageId,
                author: body.reply_meta?.preview_sender ?? "Restored",
                authorAddress: "",
                avatar: "RS",
                content: body.text ?? "",
                timestamp: "",
                createdAt: new Date().toISOString(),
                color: "#a78bfa",
                attachments: [],
            }
            useAppStore.getState().pushDmMessage(conversationId, message)
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("[history-restore] failed to parse archived plaintext", err)
        }
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
