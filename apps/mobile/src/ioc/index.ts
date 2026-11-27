import { OidcAdapter } from "@pinai/api/auth/oidc.adapter"
import { ApprovalRelayApiAdapter } from "@pinai/api/device-directory/approval-relay-api.adapter"
import { DeviceDirectoryApiAdapter } from "@pinai/api/device-directory/device-directory-api.adapter"
import { DmApiAdapter } from "@pinai/api/dm/dm-api.adapter"
import { PushRegistrationApiAdapter } from "@pinai/api/device-directory/push-registration-api.adapter"
import { HistoryArchiveApiAdapter } from "@pinai/api/e2ee/history-archive-api.adapter"
import { JwksCache } from "@pinai/api/e2ee/jwks-cache.adapter"
import { KeyDirectoryApiAdapter } from "@pinai/api/e2ee/key-directory.adapter"
import { KeyShareApiAdapter } from "@pinai/api/e2ee/key-share-api.adapter"
import { StartOverApiAdapter } from "@pinai/api/e2ee/start-over-api.adapter"
import { GroupApiAdapter } from "@pinai/api/group/group-api.adapter"
import { NodeInfoApiAdapter } from "@pinai/api/instance/nodeinfo-api.adapter"
import { SessionApiAdapter } from "@pinai/api/session/session-api.adapter"
import { UserSettingsApiAdapter } from "@pinai/api/user-settings/user-settings-api.adapter"
import { IdpWsAdapter } from "@pinai/api/ws/idp-ws.adapter"
import type { Argon2id } from "@pinai/crypto/argon2"
import { NobleAttachmentCryptoAdapter } from "@pinai/crypto/attachment-crypto"
import { E2eeAdapter } from "@pinai/crypto/e2ee.adapter"
import { HistoryArchiveAdapter } from "@pinai/crypto/history-archive.adapter"
import { NobleIdentityAdapter } from "@pinai/crypto/identity.adapter"
import { SealedStorage } from "@pinai/crypto/sealed-storage"
import type { ActorUri } from "@pinai/domain/models/e2ee"
import { appearanceHints, resolveMode } from "@pinai/domain/models/user-settings"
import type { IApprovalRelayPort } from "@pinai/domain/ports/approval-relay.port"
import type { IAttachmentCryptoPort } from "@pinai/domain/ports/attachment-crypto.port"
import type { AuthPlatform, IAuthPort } from "@pinai/domain/ports/auth.port"
import type { CachedTimelineMessage } from "@pinai/domain/ports/conversation-cache.port"
import type { IDeviceDirectoryPort } from "@pinai/domain/ports/device-directory.port"
import type { IDmPort } from "@pinai/domain/ports/dm.port"
import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import type { IGroupPort } from "@pinai/domain/ports/group.port"
import type { IHistoryArchivePort } from "@pinai/domain/ports/history-archive.port"
import type { ILastInstancePort, INodeInfoPort, IRecentInstancesPort } from "@pinai/domain/ports/instance.port"
import type { IKeySharePort } from "@pinai/domain/ports/key-share.port"
import type { IPushRegistrationPort } from "@pinai/domain/ports/push-registration.port"
import type { ISessionPort } from "@pinai/domain/ports/session.port"
import type { IStartOverPort } from "@pinai/domain/ports/start-over.port"
import type { IAccountSettingsPort, IUserSettingsStorePort } from "@pinai/domain/ports/user-settings.port"
import type { IWsPort } from "@pinai/domain/ports/ws.port"
import { type Renewal, renewSessionUseCase } from "@pinai/domain/usecases/auth/renew-session.usecase"
import type { PendingKeyLock } from "@pinai/domain/usecases/e2ee/settle-pending-history-key.usecase"
import { thisDeviceLabel, type ThisDeviceLabel } from "@pinai/domain/usecases/e2ee/this-device-label.usecase"
import { loadUserSettingsUseCase } from "@pinai/domain/usecases/user-settings/load-user-settings.usecase"
import type { MlsEngine } from "@pinai/mls/engine"
import * as Crypto from "expo-crypto"
import { router } from "expo-router"
import * as SecureStore from "expo-secure-store"
import Storage from "expo-sqlite/kv-store"
import * as WebBrowser from "expo-web-browser"
import { Appearance } from "react-native"
import { MOBILE_DOCUMENT_PATH, MobileAuthNavigationAdapter } from "@/adapters/auth/auth-navigation-mobile.adapter"
import { MemoryAuthSessionStore } from "@/adapters/auth/auth-session-memory.adapter"
import { ExpoPkceAdapter } from "@/adapters/auth/pkce-expo.adapter"
import { KeychainSessionTokenStore } from "@/adapters/auth/session-token-keychain.adapter"
import { nativeArgon2id } from "@/adapters/crypto/native-argon2id"
import { ExpoDeviceFactsAdapter } from "@/adapters/device/device-facts-expo.adapter"
import { nativeMlsEngine } from "@/adapters/mls/native-engine"
import { accountStoreNames } from "@/adapters/storage/account-store-names"
import { inProcessLock } from "@/adapters/storage/in-process-lock"
import { KeystoreDeviceKeyAdapter } from "@/adapters/storage/keystore-device-key.adapter"
import { LastInstanceKvAdapter, RecentInstancesKvAdapter } from "@/adapters/storage/kv-storage"
import { SealedConversationCache } from "@/adapters/storage/sealed-conversation-cache.adapter"
import { kvStrings } from "@/adapters/storage/kv-strings"
import { SqliteKeyValueStore } from "@/adapters/storage/sqlite-key-value-store.adapter"
import { UserSettingsKvAdapter } from "@/adapters/storage/user-settings-kv.adapter"

const authPort: IAuthPort = new OidcAdapter()
const nodeInfoPort: INodeInfoPort = new NodeInfoApiAdapter()
const recentInstancesPort: IRecentInstancesPort = new RecentInstancesKvAdapter(Storage)
const lastInstancePort: ILastInstancePort = new LastInstanceKvAdapter(Storage)
const userSettingsStore: IUserSettingsStorePort = new UserSettingsKvAdapter(Storage)
const accountSettingsPort: IAccountSettingsPort = new UserSettingsApiAdapter()
const wsPort: IWsPort = new IdpWsAdapter()

const navigation = new MobileAuthNavigationAdapter(
    {
        replace: (pathname, params) => router.replace({ pathname, params } as never),
        openAuthSession: (url, redirectUrl) => WebBrowser.openAuthSessionAsync(url, redirectUrl),
    },
    // Asked for the password again: back where it was asked, still signed in.
    () => (authPlatform.session.get("reauthenticating") ? (authPlatform.session.get("post_login_redirect") ?? "/") : "/")
)

// The app holds a session of its own (offline_access, prompt=login), as the desktop does: its
// client is the document every IdP serves for it.
const authPlatform: AuthPlatform = {
    clientId: (issuer) => `${issuer.replace(/\/$/, "")}${MOBILE_DOCUMENT_PATH}`,
    browserSession: false,
    pkce: new ExpoPkceAdapter({
        getRandomValues: (array) => Crypto.getRandomValues(array),
        sha256: (data) => Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data),
    }),
    session: new MemoryAuthSessionStore(),
    tokens: new KeychainSessionTokenStore(SecureStore, authPort),
    navigation,
    // What this phone paints, once someone signed in on it: the IdP's pages wear it.
    appearance: () => {
        const { account, device } = loadUserSettingsUseCase(userSettingsStore)
        return appearanceHints(account, resolveMode(device.mode, Appearance.getColorScheme() !== "light"))
    },
}

// One for the whole app: it is what keeps renewals one at a time.
const renewSession: () => Promise<Renewal> = renewSessionUseCase(authPort, authPlatform.tokens)

export function getAuthPort(): IAuthPort {
    return authPort
}

export function getAuthPlatform(): AuthPlatform {
    return authPlatform
}

export function getAuthNavigation(): MobileAuthNavigationAdapter {
    return navigation
}

export function getSessionRenewal(): () => Promise<Renewal> {
    return renewSession
}

export function getNodeInfoPort(): INodeInfoPort {
    return nodeInfoPort
}

export function getRecentInstancesPort(): IRecentInstancesPort {
    return recentInstancesPort
}

export function getLastInstancePort(): ILastInstancePort {
    return lastInstancePort
}

export function getUserSettingsStore(): IUserSettingsStorePort {
    return userSettingsStore
}

export function getAccountSettingsPort(): IAccountSettingsPort {
    return accountSettingsPort
}

export function getWsPort(): IWsPort {
    return wsPort
}

// A fresh engine at each call: the account's core keeps its own (`openAccountE2ee`).
export function createMlsEngine(): MlsEngine {
    return nativeMlsEngine()
}

// The native library's Argon2id, for the history key and the approval code.
export function createArgon2id(): Argon2id {
    return nativeArgon2id()
}

// An account's store and key: its own SQLite database, its own Keystore key.
function accountStores(account: ActorUri): { kv: SqliteKeyValueStore; deviceKey: KeystoreDeviceKeyAdapter } {
    const { database, keyAlias } = accountStoreNames(account)
    return { kv: new SqliteKeyValueStore(database), deviceKey: new KeystoreDeviceKeyAdapter(keyAlias) }
}

export function createSealedStorage(account: ActorUri): SealedStorage {
    const { kv, deviceKey } = accountStores(account)
    return new SealedStorage(kv, deviceKey)
}

/** The account's conversations, the domain's `IConversationCache` with what the screens read. */
export type ConversationCache = SealedConversationCache<CachedTimelineMessage>

const sessionPort: ISessionPort = new SessionApiAdapter()
const deviceDirectoryPort: IDeviceDirectoryPort = new DeviceDirectoryApiAdapter()
const pushRegistrationPort: IPushRegistrationPort = new PushRegistrationApiAdapter()
const historyArchivePort: IHistoryArchivePort = new HistoryArchiveApiAdapter()
const keySharePort: IKeySharePort = new KeyShareApiAdapter()
const startOverPort: IStartOverPort = new StartOverApiAdapter()
const dmPort: IDmPort = new DmApiAdapter()
const groupPort: IGroupPort = new GroupApiAdapter()
const approvalRelayPort: IApprovalRelayPort = new ApprovalRelayApiAdapter()
// Hermes has no Web Crypto: the attachments are opened with @noble, the same bytes as the web's.
const attachmentCryptoPort: IAttachmentCryptoPort = new NobleAttachmentCryptoAdapter()
const deviceLabel: ThisDeviceLabel = thisDeviceLabel(new ExpoDeviceFactsAdapter())
const jwksCache = new JwksCache(kvStrings)

// One account's core at a time: its MLS engine holds the account's groups in memory.
let account: { actorUri: ActorUri; e2ee: E2eeAdapter; conversations: ConversationCache; lock: PendingKeyLock } | null = null

/**
 * The signed-in account's E2EE core and its conversations, opened before anything touches its device storage.
 * Idempotent. `report` hears what the conversations' rows couldn't do.
 */
export function openAccountE2ee(actorUri: ActorUri, report: (what: string, error: unknown) => void): void {
    if (account?.actorUri === actorUri) return
    const engine = createMlsEngine()
    const argon2id = createArgon2id()
    const { kv, deviceKey } = accountStores(actorUri)
    // The previous account's writes land; its conversations take nothing more.
    void account?.conversations.close()
    account = {
        actorUri,
        e2ee: new E2eeAdapter(
            new NobleIdentityAdapter(),
            engine,
            new SealedStorage(kv, deviceKey),
            new KeyDirectoryApiAdapter(() => deviceLabel.settled()),
            engine,
            jwksCache,
            historyArchivePort,
            new HistoryArchiveAdapter(argon2id),
            argon2id
        ),
        conversations: new SealedConversationCache<CachedTimelineMessage>({ store: kv, key: deviceKey, toCached: (message) => message, report }),
        lock: inProcessLock(),
    }
}

export function getConversationCache(): ConversationCache {
    if (!account) throw new Error("No account's E2EE is open: sign in first")
    return account.conversations
}

export function getE2eePort(): IE2eePort {
    if (!account) throw new Error("No account's E2EE is open: sign in first")
    return account.e2ee
}

export function getPendingKeyLock(): PendingKeyLock | undefined {
    return account?.lock
}

export function getSessionPort(): ISessionPort {
    return sessionPort
}

export function getDeviceDirectoryPort(): IDeviceDirectoryPort {
    return deviceDirectoryPort
}

export function getPushRegistrationPort(): IPushRegistrationPort {
    return pushRegistrationPort
}

/** Whether this phone was offered push notices: once, whatever it answered. */
export const pushOffer = {
    made: (): boolean => Storage.getItemSync("pinai.push-offer") === "made",
    markMade: (): void => Storage.setItemSync("pinai.push-offer", "made"),
}

export function getHistoryArchivePort(): IHistoryArchivePort {
    return historyArchivePort
}

export function getKeySharePort(): IKeySharePort {
    return keySharePort
}

export function getDmPort(): IDmPort {
    return dmPort
}

export function getGroupPort(): IGroupPort {
    return groupPort
}

export function getAttachmentCryptoPort(): IAttachmentCryptoPort {
    return attachmentCryptoPort
}

export function getStartOverPort(): IStartOverPort {
    return startOverPort
}

export function getApprovalRelayPort(): IApprovalRelayPort {
    return approvalRelayPort
}

export function getThisDeviceLabel(): ThisDeviceLabel {
    return deviceLabel
}
