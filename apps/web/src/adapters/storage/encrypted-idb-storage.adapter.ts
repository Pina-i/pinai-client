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
 * - DB: `pinai-zustand-store:<actor URI>` (v1), one per account
 * - Object store: `slices`
 * - Key: zustand's `name` field (one entry per partialized state)
 * - Value: a `SealedBytes` — the same at-rest shape `storage.adapter.ts`
 *   writes, so there is one sealed-row format in the app
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

import type { ActorUri } from "@pinai/domain/models/e2ee"
import type { IDeviceKeyPort, SealedBytes } from "@pinai/domain/ports/device-key.port"

const DB_PREFIX = "pinai-zustand-store"
const DB_VERSION = 1
const SLICES_STORE = "slices"

/** The one cache every account shared before device storage was split per account. */
export const LEGACY_SLICES_DATABASE = DB_PREFIX

export function slicesDatabaseName(account: ActorUri): string {
    return `${DB_PREFIX}:${account}`
}

export function openSlicesDatabase(name: string): Promise<IDBPDatabase> {
    return openDB(name, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(SLICES_STORE)) {
                db.createObjectStore(SLICES_STORE)
            }
        },
    })
}

/**
 * Build a `PersistStorage` for use with Zustand's `persist` middleware.
 *
 * `deviceKey` is the same port instance the IoC layer hands to the E2EE
 * adapters, so the cached plaintexts are sealed under the device's one key
 * rather than a parallel one.
 */
export function createEncryptedIdbStorage<T>(
    deviceKey: IDeviceKeyPort,
    dbName: string | null,
): PersistStorage<T> {
    // Before the first sign-in there is no account to cache for.
    if (dbName === null) {
        return { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined }
    }
    let dbPromise: Promise<IDBPDatabase> | null = null
    const openSlicesDb = () => (dbPromise ??= openSlicesDatabase(dbName))
    return {
        async getItem(name: string): Promise<StorageValue<T> | null> {
            const db = await openSlicesDb()
            const sealed = (await db.get(SLICES_STORE, name)) as SealedBytes | undefined
            if (!sealed) return null
            try {
                return unpack(await deviceKey.open(sealed)) as StorageValue<T>
            } catch (e) {
                // Corrupt, wrong key, or a row from an older on-disk
                // format — drop it
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
            const sealed = await deviceKey.seal(pack(value))
            const db = await openSlicesDb()
            await db.put(SLICES_STORE, sealed satisfies SealedBytes, name)
        },

        async removeItem(name: string): Promise<void> {
            const db = await openSlicesDb()
            await db.delete(SLICES_STORE, name)
        },
    }
}
