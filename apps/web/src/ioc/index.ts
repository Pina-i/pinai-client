import { BrowserAuthNavigationAdapter } from "@/adapters/auth/auth-navigation-browser.adapter"
import { BrowserAuthSessionStore } from "@/adapters/auth/auth-session-browser.adapter"
import { OidcAdapter } from "@pinai/api/auth/oidc.adapter"
import { WebCryptoPkceAdapter } from "@/adapters/auth/pkce"
import { DeviceDirectoryApiAdapter } from "@pinai/api/device-directory/device-directory-api.adapter"
import { WebCryptoAttachmentCryptoAdapter } from "@pinai/crypto/attachment-crypto"
import { E2eeAdapter } from "@pinai/crypto/e2ee.adapter"
import { HistoryArchiveAdapter } from "@pinai/crypto/history-archive.adapter"
import { HistoryArchiveApiAdapter } from "@pinai/api/e2ee/history-archive-api.adapter"
import { NobleIdentityAdapter } from "@pinai/crypto/identity.adapter"
import { KeyDirectoryApiAdapter } from "@pinai/api/e2ee/key-directory.adapter"
import { MlsAdapter } from "@pinai/mls/wasm.adapter"
import { NobleRecoveryAdapter } from "@pinai/crypto/recovery.adapter"
import { JwksCacheAdapter } from "@/adapters/jwks/jwks-cache.adapter"
import { SocialApiAdapter } from "@pinai/api/social/social-api.adapter"
import { DmApiAdapter } from "@pinai/api/dm/dm-api.adapter"
import { GroupApiAdapter } from "@pinai/api/group/group-api.adapter"
import { IdpWsAdapter } from "@pinai/api/ws/idp-ws.adapter"
import { PresenceApiAdapter } from "@pinai/api/presence/presence-api.adapter"
import { TotpApiAdapter } from "@pinai/api/totp/totp-api.adapter"
import { UserApiAdapter } from "@pinai/api/user/user-api.adapter"
import { getSharedE2eeStorage, useAppStore } from "@/store/store"
import type { ArchiveEnvelope, AttachmentBlobKey, TextBody } from "@pinai/domain/models/e2ee"
import type { Message } from "@/lib/types"
import type { IAttachmentCryptoPort } from "@pinai/domain/ports/attachment-crypto.port"
import type { AuthPlatform, IAuthPort, IAuthSessionStore } from "@pinai/domain/ports/auth.port"
import type { IDeviceDirectoryPort } from "@pinai/domain/ports/device-directory.port"
import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import type { IHistoryArchivePort } from "@pinai/domain/ports/history-archive.port"
import type { IMlsEngine } from "@pinai/domain/ports/mls-engine.port"
import type { ISocialPort } from "@pinai/domain/ports/social.port"
import type { IDmPort } from "@pinai/domain/ports/dm.port"
import type { IGroupPort } from "@pinai/domain/ports/group.port"
import type { IWsPort } from "@pinai/domain/ports/ws.port"
import type { IPresencePort } from "@pinai/domain/ports/presence.port"
import type { ITotpPort } from "@pinai/domain/ports/totp.port"
import type { IUserPort } from "@pinai/domain/ports/user.port"

/**
 * Singleton instances.
 * Replace with tsyringe container when DI is added.
 */
const authPort: IAuthPort = new OidcAdapter()

// The platform half of the OIDC flow. A React Native container swaps these
// three for a deep-link navigator, secure storage and its own client id;
// nothing in `domain/usecases/auth/` changes.
const authSessionStore: IAuthSessionStore = new BrowserAuthSessionStore()
const authPlatform: AuthPlatform = {
    clientId: "web-client",
    pkce: new WebCryptoPkceAdapter(),
    session: authSessionStore,
    navigation: new BrowserAuthNavigationAdapter(),
}
const socialPort: ISocialPort = new SocialApiAdapter()
const dmPort: IDmPort = new DmApiAdapter()
const groupPort: IGroupPort = new GroupApiAdapter()
const wsPort: IWsPort = new IdpWsAdapter()
const presencePort: IPresencePort = new PresenceApiAdapter()
const totpPort: ITotpPort = new TotpApiAdapter()
const userPort: IUserPort = new UserApiAdapter()
const deviceDirectoryPort: IDeviceDirectoryPort = new DeviceDirectoryApiAdapter()
const attachmentCryptoPort: IAttachmentCryptoPort = new WebCryptoAttachmentCryptoAdapter()

// JWKS cache + history-archive singletons live alongside the other E2EE
// plumbing — keeps the per-issuer JWKS and the in-memory History Archive
// Key persistent across calls.
const jwksCache = new JwksCacheAdapter()
const historyArchivePort: IHistoryArchivePort = new HistoryArchiveApiAdapter()
const historyArchiveCrypto = new HistoryArchiveAdapter()

// E2EE crypto core. Singletons — the MLS engine owns session-scoped
// in-memory state, re-construction would lose every joined group. Storage
// is shared with the Zustand persist middleware so both reuse the same
// non-extractable AES-256-GCM device key.
//
// `mlsEngine` is the one line a React Native container replaces: same
// `IMlsEngine`, backed by the openmls crate built natively instead of
// as WASM.
const mlsEngine: IMlsEngine = new MlsAdapter()

const e2eePort: IE2eePort = new E2eeAdapter(
    new NobleIdentityAdapter(),
    mlsEngine,
    getSharedE2eeStorage(),
    new KeyDirectoryApiAdapter(),
    new NobleRecoveryAdapter(),
    historyArchivePort,
    historyArchiveCrypto,
    (conversationId, messageId, plaintext) => {
        // Push restored archive entries into the dm slice as if MLS just
        // decrypted them. `plaintext` is the buffered ArchiveEnvelope JSON
        // (sender + created_at + ApplicationMessage).
        try {
            const json = new TextDecoder().decode(plaintext)
            const envelope = JSON.parse(json) as ArchiveEnvelope
            if (envelope.v !== 1) return
            const app = envelope.app
            // Reactions/edits depend on the target row existing; skip
            // here and let the conversation viewmodel reapply them
            // from REST history on next mount.
            if (app.kind !== "text") return
            const body = app.body as TextBody
            const displayName =
                envelope.sender_display_name?.trim() ||
                envelope.sender_address.split("@")[0] ||
                "Restored"
            const attachmentKeys: Record<string, AttachmentBlobKey> | undefined = body.attachments
                ?.length
                ? Object.fromEntries(body.attachments.map((k) => [k.id, k]))
                : undefined
            const createdAt = envelope.created_at
            const createdDate = new Date(createdAt)
            const message: Message = {
                id: messageId,
                author: displayName,
                authorAddress: envelope.sender_address,
                avatar: displayName.slice(0, 2).toUpperCase(),
                content: body.text ?? "",
                timestamp: createdDate.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                }),
                createdAt,
                color: "#a78bfa",
                attachments: [],
                ...(attachmentKeys ? { attachmentKeys } : {}),
                ...(body.reply_meta
                    ? {
                          replyTo: {
                              id: body.reply_meta.target_message_id,
                              content: body.reply_meta.preview_text,
                              author: body.reply_meta.preview_sender,
                          },
                      }
                    : {}),
            }
            useAppStore.getState().pushDmMessage(conversationId, message)
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("[history-restore] failed to parse archived envelope", err)
        }
    },
)

export function getAuthPort(): IAuthPort {
    return authPort
}

export function getAuthPlatform(): AuthPlatform {
    return authPlatform
}

export function getAuthSessionStore(): IAuthSessionStore {
    return authSessionStore
}

export function getSocialPort(): ISocialPort {
    return socialPort
}

export function getDmPort(): IDmPort {
    return dmPort
}

export function getGroupPort(): IGroupPort {
    return groupPort
}

export function getWsPort(): IWsPort {
    return wsPort
}

export function getPresencePort(): IPresencePort {
    return presencePort
}

export function getTotpPort(): ITotpPort {
    return totpPort
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

export function getAttachmentCryptoPort(): IAttachmentCryptoPort {
    return attachmentCryptoPort
}

export function getJwksCache(): JwksCacheAdapter {
    return jwksCache
}

export function getHistoryArchivePort(): IHistoryArchivePort {
    return historyArchivePort
}
