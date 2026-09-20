import { create } from "zustand"
import type { IDeviceKeyPort } from "@pinai/domain/ports/device-key.port"
import { devtools, persist } from "zustand/middleware"
// This file is a composition root, like `ioc/index.ts`: it is where the
// platform's persistence is wired into the store. The slices under
// `store/slices/` stay free of adapters — they are the part a React Native
// app reuses, while this file gets a sibling that wires SQLite or MMKV.
import { WebCryptoDeviceKeyAdapter } from "@/adapters/e2ee/device-key.adapter"
import { SealedStorage } from "@/adapters/e2ee/sealed-storage"
import { createEncryptedIdbStorage } from "@/adapters/storage/encrypted-idb-storage.adapter"
import { IdbKeyValueStore } from "@/adapters/storage/idb-key-value-store.adapter"
import { createAuthSlice, type AuthSlice } from "./slices/auth.slice"
import { createUiSlice, type UiSlice } from "./slices/ui.slice"
import { createDataSlice, type DataSlice } from "./slices/data.slice"
import { createWsSlice, type WsSlice } from "./slices/ws.slice"
import { createPresenceSlice, type PresenceSlice } from "./slices/presence.slice"
import { createAvatarsSlice, type AvatarsSlice } from "./slices/avatars.slice"
import { createE2eeSlice, type E2eeSlice } from "./slices/e2ee.slice"
import { createTotpSlice, type TotpSlice } from "./slices/totp.slice"

export type AppStore =
    & AuthSlice
    & UiSlice
    & DataSlice
    & WsSlice
    & PresenceSlice
    & AvatarsSlice
    & E2eeSlice
    & TotpSlice

/**
 * Persisted slice — the parts of the store we want to survive page
 * reloads. Today: the message-plaintext cache (`dmMessages`) and the
 * unread counters keyed by conversation_id (`dmUnread`).
 *
 * Why these two specifically:
 * - `dmMessages` holds plaintexts the client has already decrypted.
 *   MLS forward secrecy purges per-message keys after `process_message`,
 *   so this cache is the only way a refreshed page can re-render
 *   conversation history.
 * - `dmUnread` should obviously survive reloads.
 *
 * Auth, presence, avatars are deliberately *not* persisted: they're
 * either security-sensitive (access token) or trivially re-fetched
 * after login.
 */
type PersistedAppState = {
    dmMessages: WsSlice["dmMessages"]
    appliedReactionIds: WsSlice["appliedReactionIds"]
    dmUnread: DataSlice["dmUnread"]
}

// The three pieces of this platform's persistence, wired together once:
// IndexedDB for the bytes, WebCrypto for the at-rest key, and the
// backend-agnostic schema on top. A React Native container swaps the first
// two and keeps `SealedStorage` as it is.
const keyValueStore = new IdbKeyValueStore()

// The `CryptoKey` itself never leaves the adapter layer — this port exposes
// only seal/open/wipe, which is the shape a Keychain-backed implementation
// can also honour.
const deviceKeyPort = new WebCryptoDeviceKeyAdapter(keyValueStore)
export function getDeviceKeyPort(): IDeviceKeyPort {
    return deviceKeyPort
}

// Shared between the E2EE port (in `ioc/index.ts`) and the persist
// middleware so both seal under the same device-bound key.
const sharedE2eeStorage = new SealedStorage(keyValueStore, deviceKeyPort)
export function getSharedE2eeStorage() {
    return sharedE2eeStorage
}

export const useAppStore = create<AppStore>()(
    devtools(
        persist(
            (...a) => ({
                ...createAuthSlice(...a),
                ...createUiSlice(...a),
                ...createDataSlice(...a),
                ...createWsSlice(...a),
                ...createPresenceSlice(...a),
                ...createAvatarsSlice(...a),
                ...createE2eeSlice(...a),
                ...createTotpSlice(...a),
            }),
            {
                name: "pinai-app-state",
                storage: createEncryptedIdbStorage<PersistedAppState>(deviceKeyPort),
                partialize: (s): PersistedAppState => ({
                    dmMessages: s.dmMessages,
                    appliedReactionIds: s.appliedReactionIds,
                    dmUnread: s.dmUnread,
                }),
                version: 1,
            },
        ),
        { name: "AppStore" },
    ),
)
