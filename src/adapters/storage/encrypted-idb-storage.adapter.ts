/**
 * Zustand `persist` storage backed by IndexedDB + at-rest AES-GCM
 * encryption.
 *
 * Used for the message-plaintext slice (`dmMessages`) so MLS forward
 * secrecy doesn't blank conversation history on every reload. Sealing goes
 * through {@link IDeviceKeyPort}, which on the web is backed by the same
 * non-extractable `CryptoKey` the E2EE storage adapter manages — sharing it
 * keeps the device-scoped attack surface to a single key.
 *
 * This lives in `adapters/`, not `store/`: IndexedDB and WebCrypto are both
 * platform choices. A React Native build supplies a sibling implementation
 * over SQLite or MMKV and hands the result to the same `persist` middleware.
 *
 * Storage layout
 * - DB: `pinai-zustand-store` (v1)
 * - Object store: `slices`
 * - Key: zustand's `name` field (one entry per partialized state)
 * - Value: `{ ciphertext, iv }` — see `SealedSlice` for why those names
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
 * The first call lazily creates the IDB database AND the device key (via the
 * device-key port). If the user reloads before the E2EE adapters have done
 * any other work, that's fine — the persist middleware just opens the DB and
 * creates whatever's missing.
 */

import { type IDBPDatabase, openDB } from "idb"
import { pack, unpack } from "msgpackr"
import type { PersistStorage, StorageValue } from "zustand/middleware"

import type { IDeviceKeyPort } from "@/domain/ports/device-key.port"

const DB_NAME = "pinai-zustand-store"
const DB_VERSION = 1
const SLICES_STORE = "slices"

/**
 * On-disk row. The field names predate the device-key port and are kept as
 * they are — `iv` rather than `nonce`, and a `ciphertext` that may be an
 * `ArrayBuffer` on rows written before the port existed. Renaming or
 * re-typing them would make every already-persisted conversation cache
 * undecodable, costing users their offline history for nothing.
 */
interface SealedSlice {
    ciphertext: ArrayBuffer | Uint8Array
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

function toBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
    return value instanceof Uint8Array ? value : new Uint8Array(value)
}

/**
 * Build a `PersistStorage` for use with Zustand's `persist` middleware.
 *
 * `deviceKey` is the same port instance the IoC layer hands to the E2EE
 * adapters, so the cached plaintexts are sealed under the device's one key
 * rather than a parallel one.
 */
export function createEncryptedIdbStorage<T>(deviceKey: IDeviceKeyPort): PersistStorage<T> {
    return {
        async getItem(name: string): Promise<StorageValue<T> | null> {
            const db = await openSlicesDb()
            const sealed = (await db.get(SLICES_STORE, name)) as SealedSlice | undefined
            if (!sealed) return null
            try {
                const plaintext = await deviceKey.open({
                    ciphertext: toBytes(sealed.ciphertext),
                    nonce: sealed.iv,
                })
                return unpack(plaintext) as StorageValue<T>
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
            const { ciphertext, nonce } = await deviceKey.seal(pack(value))
            const db = await openSlicesDb()
            await db.put(SLICES_STORE, { ciphertext, iv: nonce } satisfies SealedSlice, name)
        },

        async removeItem(name: string): Promise<void> {
            const db = await openSlicesDb()
            await db.delete(SLICES_STORE, name)
        },
    }
}
