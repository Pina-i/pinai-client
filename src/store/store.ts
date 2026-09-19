import { create } from "zustand"
import { devtools, persist } from "zustand/middleware"
// TODO(mobile): the store reaches for the web storage adapter directly.
// Breaking this needs the device key behind an encrypt/decrypt port and
// IndexedDB behind a key-value port — the storage/crypto pass, not this one.
// eslint-disable-next-line no-restricted-imports
import { IndexedDbStorageAdapter } from "@/adapters/e2ee/storage.adapter"
import { createAuthSlice, type AuthSlice } from "./slices/auth.slice"
import { createUiSlice, type UiSlice } from "./slices/ui.slice"
import { createDataSlice, type DataSlice } from "./slices/data.slice"
import { createWsSlice, type WsSlice } from "./slices/ws.slice"
import { createPresenceSlice, type PresenceSlice } from "./slices/presence.slice"
import { createAvatarsSlice, type AvatarsSlice } from "./slices/avatars.slice"
import { createE2eeSlice, type E2eeSlice } from "./slices/e2ee.slice"
import { createTotpSlice, type TotpSlice } from "./slices/totp.slice"
import { createEncryptedIdbStorage } from "./encrypted-idb-storage"

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

// One IoC instance shared between the E2EE port (in `ioc/index.ts`)
// and the persist middleware so both reuse the same device-bound
// AES-256-GCM key for at-rest encryption.
const sharedE2eeStorage = new IndexedDbStorageAdapter()
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
                storage: createEncryptedIdbStorage<PersistedAppState>(sharedE2eeStorage),
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
