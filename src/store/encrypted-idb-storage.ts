/**
 * Zustand `persist` storage backed by IndexedDB + at-rest AES-GCM
 * encryption.
 *
 * Used for the message-plaintext slice (`dmMessages`) so MLS forward
 * secrecy doesn't blank conversation history on every reload. The
 * encryption key is the same non-extractable AES-256-GCM `CryptoKey`
 * the E2EE storage adapter manages — sharing it keeps the device-
 * scoped attack surface to a single key.
 *
 * Storage layout
 * - DB: `pinai-zustand-store` (v1)
 * - Object store: `slices`
 * - Key: zustand's `name` field (one entry per partialized state)
 * - Value: `{ ciphertext: ArrayBuffer, iv: Uint8Array }`
 *
 * Inner serialization is **msgpack** (`msgpackr`), not JSON. JSON has
 * no native binary type — a `Uint8Array` round-trips through it as an
 * indexed-property object that Web Crypto APIs reject with "Data
 * provided to an operation does not meet requirements". Persisted
 * `AttachmentBlobKey.key` / `.nonce` and any future binary field
 * would need hand-rolled base64 tagging on every boundary. msgpack
 * preserves `Uint8Array` natively, eliminates ~33% base64 overhead on
 * binary payloads, and serialises ~2-3× faster on typical chat data.
 *
 * The first call lazily creates the IDB database AND the device key
 * (via the shared `E2eeStorage`). If the user reloads before the
 * E2EE adapters have done any other work, that's fine — the persist
 * middleware just opens the DB and creates whatever's missing.
 */

import { type IDBPDatabase, openDB } from "idb"
import { pack, unpack } from "msgpackr"
import type { PersistStorage, StorageValue } from "zustand/middleware"

// TODO(mobile): the store reaches for the web storage adapter directly.
// Breaking this needs the device key behind an encrypt/decrypt port and
// IndexedDB behind a key-value port — the storage/crypto pass, not this one.
// eslint-disable-next-line no-restricted-imports
import type { E2eeStorage } from "@/adapters/e2ee/storage.adapter"

const DB_NAME = "pinai-zustand-store"
const DB_VERSION = 1
const SLICES_STORE = "slices"

const IV_BYTES = 12

interface SealedSlice {
    ciphertext: ArrayBuffer
    iv: Uint8Array
}

let dbPromise: Promise<IDBPDatabase> | null = null

function openSlicesDb(): Promise<IDBPDatabase> {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(SLICES_STORE)) {
                    db.createObjectStore(SLICES_STORE)
                }
            },
        })
    }
    return dbPromise
}

/**
 * Build a `PersistStorage` for use with Zustand's `persist` middleware.
 *
 * `e2eeStorage` is the same adapter instance the IoC layer hands to
 * the E2EE port — the one that owns the non-extractable AES-256-GCM
 * `CryptoKey`. Wiring it through here means we don't end up with two
 * device keys floating around.
 */
export function createEncryptedIdbStorage<T>(e2eeStorage: E2eeStorage): PersistStorage<T> {
    return {
        async getItem(name: string): Promise<StorageValue<T> | null> {
            const db = await openSlicesDb()
            const sealed = (await db.get(SLICES_STORE, name)) as SealedSlice | undefined
            if (!sealed) return null
            try {
                const key = await e2eeStorage.getOrCreateDeviceKey()
                const plaintext = await crypto.subtle.decrypt(
                    { name: "AES-GCM", iv: sealed.iv as BufferSource },
                    key,
                    sealed.ciphertext,
                )
                return unpack(new Uint8Array(plaintext)) as StorageValue<T>
            } catch (e) {
                // Corrupt or wrong key (or a pre-msgpack-era JSON
                // blob from before the format swap) — drop the row
                // so the next save starts clean. Returning null
                // makes Zustand boot with the slice's default state,
                // which is the right failure mode (vs. blowing up
                // the whole app). For an evicted JSON row, the next
                // live message + the next history fetch repopulate
                // `dmMessages` from the server.
                // eslint-disable-next-line no-console
                console.warn(`Persisted slice "${name}" failed to decode; dropping`, e)
                await db.delete(SLICES_STORE, name).catch(() => undefined)
                return null
            }
        },

        async setItem(name: string, value: StorageValue<T>): Promise<void> {
            const key = await e2eeStorage.getOrCreateDeviceKey()
            const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
            const packed = pack(value)
            const ciphertext = await crypto.subtle.encrypt(
                { name: "AES-GCM", iv },
                key,
                packed as BufferSource,
            )
            const db = await openSlicesDb()
            await db.put(SLICES_STORE, { ciphertext, iv } satisfies SealedSlice, name)
        },

        async removeItem(name: string): Promise<void> {
            const db = await openSlicesDb()
            await db.delete(SLICES_STORE, name)
        },
    }
}
