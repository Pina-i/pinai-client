import { OidcAdapter } from "@pinai/api/auth/oidc.adapter"
import { NodeInfoApiAdapter } from "@pinai/api/instance/nodeinfo-api.adapter"
import { UserSettingsApiAdapter } from "@pinai/api/user-settings/user-settings-api.adapter"
import { IdpWsAdapter } from "@pinai/api/ws/idp-ws.adapter"
import { SealedStorage } from "@pinai/crypto/sealed-storage"
import type { ActorUri } from "@pinai/domain/models/e2ee"
import { appearanceHints, resolveMode } from "@pinai/domain/models/user-settings"
import type { AuthPlatform, IAuthPort } from "@pinai/domain/ports/auth.port"
import type { ILastInstancePort, INodeInfoPort, IRecentInstancesPort } from "@pinai/domain/ports/instance.port"
import type { IAccountSettingsPort, IUserSettingsStorePort } from "@pinai/domain/ports/user-settings.port"
import type { IWsPort } from "@pinai/domain/ports/ws.port"
import { type Renewal, renewSessionUseCase } from "@pinai/domain/usecases/auth/renew-session.usecase"
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
import { nativeMlsEngine } from "@/adapters/mls/native-engine"
import { accountStoreNames } from "@/adapters/storage/account-store-names"
import { KeystoreDeviceKeyAdapter } from "@/adapters/storage/keystore-device-key.adapter"
import { LastInstanceKvAdapter, RecentInstancesKvAdapter } from "@/adapters/storage/kv-storage"
import { SqliteKeyValueStore } from "@/adapters/storage/sqlite-key-value-store.adapter"
import { UserSettingsKvAdapter } from "@/adapters/storage/user-settings-kv.adapter"

const authPort: IAuthPort = new OidcAdapter()
const nodeInfoPort: INodeInfoPort = new NodeInfoApiAdapter()
const recentInstancesPort: IRecentInstancesPort = new RecentInstancesKvAdapter(Storage)
const lastInstancePort: ILastInstancePort = new LastInstanceKvAdapter(Storage)
const userSettingsStore: IUserSettingsStorePort = new UserSettingsKvAdapter(Storage)
const accountSettingsPort: IAccountSettingsPort = new UserSettingsApiAdapter()
const wsPort: IWsPort = new IdpWsAdapter()

const navigation = new MobileAuthNavigationAdapter({
    replace: (pathname, params) => router.replace({ pathname, params } as never),
    openAuthSession: (url, redirectUrl) => WebBrowser.openAuthSessionAsync(url, redirectUrl),
})

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

// The app's own engine, with its storage, comes later.
export function createMlsEngine(): MlsEngine {
    return nativeMlsEngine()
}

// An account's encrypted store: its own SQLite database, its own Keystore key.
export function createSealedStorage(account: ActorUri): SealedStorage {
    const { database, keyAlias } = accountStoreNames(account)
    return new SealedStorage(new SqliteKeyValueStore(database), new KeystoreDeviceKeyAdapter(keyAlias))
}
