import { BrowserAuthNavigationAdapter } from "@/adapters/auth/auth-navigation-browser.adapter"
import { BrowserAuthSessionStore } from "@/adapters/auth/auth-session-browser.adapter"
import { MemorySessionTokenStore } from "@/adapters/auth/session-token-memory.adapter"
import {
    DESKTOP_DOCUMENT_PATH,
    DesktopAuthNavigationAdapter,
} from "@/adapters/desktop/auth-navigation-desktop.adapter"
import { desktopBridge } from "@/adapters/desktop/desktop-bridge"
import { DesktopSessionTokenStore } from "@/adapters/desktop/session-token-desktop.adapter"
import { type RenewAccessToken, retryUnauthorizedWith } from "@pinai/api/http"
import { OidcAdapter } from "@pinai/api/auth/oidc.adapter"
import { WebCryptoPkceAdapter } from "@/adapters/auth/pkce"
import { DeviceDirectoryApiAdapter } from "@pinai/api/device-directory/device-directory-api.adapter"
import { SessionApiAdapter } from "@pinai/api/session/session-api.adapter"
import { WebCryptoAttachmentCryptoAdapter } from "@pinai/crypto/attachment-crypto"
import { E2eeAdapter } from "@pinai/crypto/e2ee.adapter"
import { HistoryArchiveAdapter } from "@pinai/crypto/history-archive.adapter"
import { HistoryArchiveApiAdapter } from "@pinai/api/e2ee/history-archive-api.adapter"
import { NobleIdentityAdapter } from "@pinai/crypto/identity.adapter"
import { KeyDirectoryApiAdapter } from "@pinai/api/e2ee/key-directory.adapter"
import { MlsAdapter } from "@pinai/mls/wasm.adapter"
import { NobleRecoveryAdapter } from "@pinai/crypto/recovery.adapter"
import { JwksCacheAdapter } from "@/adapters/jwks/jwks-cache.adapter"
import { UserSettingsLocalStorageAdapter } from "@/adapters/user-settings/user-settings-local-storage.adapter"
import { RecentInstancesLocalStorageAdapter } from "@/adapters/instance/recent-instances-local-storage.adapter"
import { NotificationSoundWebAudioAdapter } from "@/adapters/sound/notification-sound-web-audio.adapter"
import { NodeInfoApiAdapter } from "@pinai/api/instance/nodeinfo-api.adapter"
import { InstanceAdminApiAdapter } from "@pinai/api/admin/instance-admin-api.adapter"
import { SocialApiAdapter } from "@pinai/api/social/social-api.adapter"
import { PrivacyApiAdapter } from "@pinai/api/privacy/privacy-api.adapter"
import { DmApiAdapter } from "@pinai/api/dm/dm-api.adapter"
import { GroupApiAdapter } from "@pinai/api/group/group-api.adapter"
import { IdpWsAdapter } from "@pinai/api/ws/idp-ws.adapter"
import { PresenceApiAdapter } from "@pinai/api/presence/presence-api.adapter"
import { TotpApiAdapter } from "@pinai/api/totp/totp-api.adapter"
import { UserApiAdapter } from "@pinai/api/user/user-api.adapter"
import { UserSettingsApiAdapter } from "@pinai/api/user-settings/user-settings-api.adapter"
import { getAccountStorage, getSharedE2eeStorage, useAppStore } from "@/store/store"
import type { ArchiveEnvelope, AttachmentBlobKey, TextBody } from "@pinai/domain/models/e2ee"
import type { Message } from "@/lib/types"
import type { IAttachmentCryptoPort } from "@pinai/domain/ports/attachment-crypto.port"
import type { IAccountStoragePort } from "@pinai/domain/ports/account-storage.port"
import type { AuthPlatform, IAuthPort, IAuthSessionStore } from "@pinai/domain/ports/auth.port"
import { type Renewal, renewSessionUseCase } from "@pinai/domain/usecases/auth/renew-session.usecase"
import type { IDeviceDirectoryPort } from "@pinai/domain/ports/device-directory.port"
import type { ISessionPort } from "@pinai/domain/ports/session.port"
import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import type { IHistoryArchivePort } from "@pinai/domain/ports/history-archive.port"
import type { IMlsEngine } from "@pinai/domain/ports/mls-engine.port"
import type { ISocialPort } from "@pinai/domain/ports/social.port"
import type { IPrivacyPort } from "@pinai/domain/ports/privacy.port"
import type { IDmPort } from "@pinai/domain/ports/dm.port"
import type { IGroupPort } from "@pinai/domain/ports/group.port"
import type { IWsPort } from "@pinai/domain/ports/ws.port"
import type { IPresencePort } from "@pinai/domain/ports/presence.port"
import type { ITotpPort } from "@pinai/domain/ports/totp.port"
import type { IUserPort } from "@pinai/domain/ports/user.port"
import type { IAccountSettingsPort, IUserSettingsStorePort } from "@pinai/domain/ports/user-settings.port"
import type { INodeInfoPort, IRecentInstancesPort } from "@pinai/domain/ports/instance.port"
import type { IInstanceAdminPort } from "@pinai/domain/ports/instance-admin.port"
import type { INotificationSoundPort } from "@pinai/domain/ports/notification-sound.port"
import { appearanceHints, resolveMode } from "@pinai/domain/models/user-settings"
import { loadUserSettingsUseCase } from "@pinai/domain/usecases/user-settings/load-user-settings.usecase"

/**
 * Singleton instances.
 * Replace with tsyringe container when DI is added.
 */
const authPort: IAuthPort = new OidcAdapter()
const userSettingsStore: IUserSettingsStorePort = new UserSettingsLocalStorageAdapter()

// The platform half of the OIDC flow. The desktop app swaps in its client, its window and the main
// process's keychain; a React Native container would swap the same; nothing in
// `domain/usecases/auth/` changes.
const desktop = import.meta.env.PINAI_DESKTOP === true ? desktopBridge() : null
const authSessionStore: IAuthSessionStore = new BrowserAuthSessionStore()
const authPlatform: AuthPlatform = {
    // The web deployment's own document, published by the `oauthClientDocument` Vite plugin; the
    // desktop app's, which every IdP serves itself.
    clientId: (issuer) =>
        desktop
            ? `${issuer.replace(/\/$/, "")}${DESKTOP_DOCUMENT_PATH}`
            : new URL("/oauth-client.json", window.location.origin).href,
    browserSession: !desktop,
    pkce: new WebCryptoPkceAdapter(),
    session: authSessionStore,
    tokens: desktop ? new DesktopSessionTokenStore(desktop) : new MemorySessionTokenStore(),
    navigation: desktop ? new DesktopAuthNavigationAdapter(desktop) : new BrowserAuthNavigationAdapter(),
    // What this page paints: the settings index.html applies, with `system` resolved the same way.
    appearance: () => {
        const { account, device } = loadUserSettingsUseCase(userSettingsStore)
        const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
        return appearanceHints(account, resolveMode(device.mode, systemPrefersDark))
    },
}
const nodeInfoPort: INodeInfoPort = new NodeInfoApiAdapter()
const recentInstancesPort: IRecentInstancesPort = new RecentInstancesLocalStorageAdapter()
const instanceAdminPort: IInstanceAdminPort = new InstanceAdminApiAdapter()
const notificationSoundPort: INotificationSoundPort = new NotificationSoundWebAudioAdapter()
const socialPort: ISocialPort = new SocialApiAdapter()
const privacyPort: IPrivacyPort = new PrivacyApiAdapter()
const dmPort: IDmPort = new DmApiAdapter()
const groupPort: IGroupPort = new GroupApiAdapter()
const wsPort: IWsPort = new IdpWsAdapter()
const presencePort: IPresencePort = new PresenceApiAdapter()
const totpPort: ITotpPort = new TotpApiAdapter()
const userPort: IUserPort = new UserApiAdapter()
const deviceDirectoryPort: IDeviceDirectoryPort = new DeviceDirectoryApiAdapter()
const sessionPort: ISessionPort = new SessionApiAdapter()
const attachmentCryptoPort: IAttachmentCryptoPort = new WebCryptoAttachmentCryptoAdapter()

// JWKS cache + history-archive singletons live alongside the other E2EE
// plumbing — keeps the per-issuer JWKS and the in-memory History Archive
// Key persistent across calls.
const jwksCache = new JwksCacheAdapter()
const accountSettingsPort: IAccountSettingsPort = new UserSettingsApiAdapter()
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

// One for the whole page: it is what keeps renewals one at a time. On the desktop, the main
// process holds the token and runs the renewals.
const renewSession: () => Promise<Renewal> = desktop
    ? () => desktop.session.renew()
    : renewSessionUseCase(authPort, authPlatform.tokens)

export function getSessionRenewal(): () => Promise<Renewal> {
    return renewSession
}

/** What every IdP request refused with `401` goes through before it is sent once more. */
export function onAccessTokenRefused(renew: RenewAccessToken): void {
    retryUnauthorizedWith(renew)
}

export function getNodeInfoPort(): INodeInfoPort {
    return nodeInfoPort
}

export function getRecentInstancesPort(): IRecentInstancesPort {
    return recentInstancesPort
}

export function getInstanceAdminPort(): IInstanceAdminPort {
    return instanceAdminPort
}

export function getNotificationSoundPort(): INotificationSoundPort {
    return notificationSoundPort
}

export function getSocialPort(): ISocialPort {
    return socialPort
}

export function getPrivacyPort(): IPrivacyPort {
    return privacyPort
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

export function getAccountStoragePort(): IAccountStoragePort {
    return getAccountStorage()
}

export function getSessionPort(): ISessionPort {
    return sessionPort
}

export function getDeviceDirectoryPort(): IDeviceDirectoryPort {
    return deviceDirectoryPort
}

export function getAttachmentCryptoPort(): IAttachmentCryptoPort {
    return attachmentCryptoPort
}

export function getUserSettingsStore(): IUserSettingsStorePort {
    return userSettingsStore
}

export function getAccountSettingsPort(): IAccountSettingsPort {
    return accountSettingsPort
}

export function getJwksCache(): JwksCacheAdapter {
    return jwksCache
}

export function getHistoryArchivePort(): IHistoryArchivePort {
    return historyArchivePort
}
