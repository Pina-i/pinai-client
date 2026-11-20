import { OidcAdapter } from "@pinai/api/auth/oidc.adapter"
import { NodeInfoApiAdapter } from "@pinai/api/instance/nodeinfo-api.adapter"
import type { AuthPlatform, IAuthPort } from "@pinai/domain/ports/auth.port"
import type { ILastInstancePort, INodeInfoPort, IRecentInstancesPort } from "@pinai/domain/ports/instance.port"
import { type Renewal, renewSessionUseCase } from "@pinai/domain/usecases/auth/renew-session.usecase"
import * as Crypto from "expo-crypto"
import { router } from "expo-router"
import * as SecureStore from "expo-secure-store"
import Storage from "expo-sqlite/kv-store"
import * as WebBrowser from "expo-web-browser"
import { MOBILE_DOCUMENT_PATH, MobileAuthNavigationAdapter } from "@/adapters/auth/auth-navigation-mobile.adapter"
import { MemoryAuthSessionStore } from "@/adapters/auth/auth-session-memory.adapter"
import { ExpoPkceAdapter } from "@/adapters/auth/pkce-expo.adapter"
import { KeychainSessionTokenStore } from "@/adapters/auth/session-token-keychain.adapter"
import { LastInstanceKvAdapter, RecentInstancesKvAdapter } from "@/adapters/storage/kv-storage"

const authPort: IAuthPort = new OidcAdapter()
const nodeInfoPort: INodeInfoPort = new NodeInfoApiAdapter()
const recentInstancesPort: IRecentInstancesPort = new RecentInstancesKvAdapter(Storage)
const lastInstancePort: ILastInstancePort = new LastInstanceKvAdapter(Storage)

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
    appearance: () => null,
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
