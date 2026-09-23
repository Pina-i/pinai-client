import { type IDBPDatabase, openDB } from "idb"

import type { ActorUri } from "@pinai/domain/models/e2ee"
import type { IKeyValueStore } from "@pinai/domain/ports/key-value-store.port"

const DB_PREFIX = "pinai-e2ee"
/** v4 added `device_attestation` (Phase 7). */
const DB_VERSION = 4

/** The one store every account shared before device storage was split per account. */
export const LEGACY_E2EE_DATABASE = DB_PREFIX

export function e2eeDatabaseName(account: ActorUri): string {
    return `${DB_PREFIX}:${account}`
}

/**
 * Collections the E2EE store keeps. They are object stores here; a SQLite
 * backend would make them tables, MMKV would make them key prefixes.
 */
export const COLLECTIONS = [
    "meta",
    "identity",
    "groups",
    "mls_snapshot",
    "recovery_passphrase",
    "device_attestation",
] as const

/** Slot the web keeps its `CryptoKey` in — see {@link IdbKeyValueStore.putCryptoKey}. */
const CRYPTO_KEY_SLOT = "device_key"

export function openE2eeDatabase(name: string): Promise<IDBPDatabase> {
    return openDB(name, DB_VERSION, {
        upgrade(db) {
            for (const collection of COLLECTIONS) {
                if (!db.objectStoreNames.contains(collection)) db.createObjectStore(collection)
            }
        },
    })
}

/**
 * IndexedDB implementation of {@link IKeyValueStore}.
 *
 * Also holds the one thing the port deliberately cannot carry: a
 * non-extractable `CryptoKey`. IndexedDB can structured-clone one, which is
 * what lets the web keep a key it can use but never read. That capability is
 * exposed as extra methods on this class rather than on the port, because no
 * other backend has it — a React Native build keeps its key in the Keychain
 * and implements `IKeyValueStore` alone.
 */
export class IdbKeyValueStore implements IKeyValueStore {
    private readonly name: string | null
    private db: IDBPDatabase | null = null

    /** `null` before any account has signed in: every call rejects rather than open a store no account owns. */
    constructor(name: string | null) {
        this.name = name
    }

    private async openIfNeeded(): Promise<IDBPDatabase> {
        if (this.db) return this.db
        if (this.name === null) throw new Error("No account storage is open — sign in first")
        this.db = await openE2eeDatabase(this.name)
        return this.db
    }

    close(): void {
        this.db?.close()
        this.db = null
    }

    async get(collection: string, key: string): Promise<Uint8Array | undefined> {
        const db = await this.openIfNeeded()
        return (await db.get(collection, key)) as Uint8Array | undefined
    }

    async put(collection: string, key: string, value: Uint8Array): Promise<void> {
        const db = await this.openIfNeeded()
        await db.put(collection, value, key)
    }

    async delete(collection: string, key: string): Promise<void> {
        const db = await this.openIfNeeded()
        await db.delete(collection, key)
    }

    async clear(): Promise<void> {
        const db = await this.openIfNeeded()
        const tx = db.transaction([...COLLECTIONS], "readwrite")
        await Promise.all(COLLECTIONS.map((name) => tx.objectStore(name).clear()))
        await tx.done
    }

    // ─── web-only: the device key itself ──────────────────────────────────

    async getCryptoKey(): Promise<CryptoKey | undefined> {
        const db = await this.openIfNeeded()
        return (await db.get("meta", CRYPTO_KEY_SLOT)) as CryptoKey | undefined
    }

    /**
     * Stores the `CryptoKey` object itself, not its bytes — a non-extractable
     * key has no bytes to store. An attacker with execution access can ask
     * IndexedDB for it and use it, but cannot lift the material out and carry
     * it to another machine.
     */
    async putCryptoKey(key: CryptoKey): Promise<void> {
        const db = await this.openIfNeeded()
        await db.put("meta", key, CRYPTO_KEY_SLOT)
    }

    async deleteCryptoKey(): Promise<void> {
        const db = await this.openIfNeeded()
        await db.delete("meta", CRYPTO_KEY_SLOT)
    }
}
