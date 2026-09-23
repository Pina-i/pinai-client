import { type IDBPDatabase, openDB } from "idb"

import { WebCryptoDeviceKeyAdapter } from "@/adapters/e2ee/device-key.adapter"
import {
    LEGACY_SLICES_DATABASE,
    openSlicesDatabase,
    slicesDatabaseName,
} from "@/adapters/storage/encrypted-idb-storage.adapter"
import {
    IdbKeyValueStore,
    LEGACY_E2EE_DATABASE,
    e2eeDatabaseName,
    openE2eeDatabase,
} from "@/adapters/storage/idb-key-value-store.adapter"
import { SealedStorage } from "@pinai/crypto/sealed-storage"
import type { ActorUri } from "@pinai/domain/models/e2ee"
import { asActorUri } from "@pinai/domain/models/identity"
import type { IAccountStoragePort } from "@pinai/domain/ports/account-storage.port"

const OPEN_ACCOUNT_KEY = "e2ee_account"

/**
 * The web opens one account's IndexedDB databases per page load, named after
 * the account in `localStorage`. Switching records the new account and
 * reloads, which is also what drops the previous account's in-memory state.
 */
export class BrowserAccountStorageAdapter implements IAccountStoragePort {
    private readonly opened: ActorUri | null
    private readonly reload: () => void

    constructor(reload: () => void = () => window.location.reload()) {
        const stored = localStorage.getItem(OPEN_ACCOUNT_KEY)
        this.opened = stored ? asActorUri(stored) : null
        this.reload = reload
    }

    openAccount(): ActorUri | null {
        return this.opened
    }

    async switchTo(actorUri: ActorUri): Promise<void> {
        try {
            await adoptLegacyStores()
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("Account storage: could not adopt the pre-split store; it starts fresh", e)
        }
        localStorage.setItem(OPEN_ACCOUNT_KEY, actorUri)
        // Reloading without the account recorded would come straight back here.
        if (localStorage.getItem(OPEN_ACCOUNT_KEY) !== actorUri) {
            throw new Error("Could not record the signed-in account")
        }
        this.reload()
        return new Promise<never>(() => undefined)
    }
}

/**
 * Hands the single shared store of earlier builds to the account it is bound
 * to, so upgrading does not cost that account its device. The message cache
 * goes with it: it is sealed under the same device key.
 */
async function adoptLegacyStores(): Promise<void> {
    const existing = new Set((await indexedDB.databases()).map((db) => db.name))
    if (!existing.has(LEGACY_E2EE_DATABASE) && !existing.has(LEGACY_SLICES_DATABASE)) return

    const owner = existing.has(LEGACY_E2EE_DATABASE) ? await legacyOwner() : null
    if (owner) {
        await copyDatabase(LEGACY_E2EE_DATABASE, e2eeDatabaseName(owner), openE2eeDatabase, existing)
        await copyDatabase(LEGACY_SLICES_DATABASE, slicesDatabaseName(owner), openSlicesDatabase, existing)
    }
    await deleteDatabase(LEGACY_E2EE_DATABASE)
    await deleteDatabase(LEGACY_SLICES_DATABASE)
}

async function legacyOwner(): Promise<ActorUri | null> {
    const kv = new IdbKeyValueStore(LEGACY_E2EE_DATABASE)
    try {
        return await new SealedStorage(kv, new WebCryptoDeviceKeyAdapter(kv)).getBoundActorUri()
    } finally {
        kv.close()
    }
}

/** Copies every row, the device `CryptoKey` included — IndexedDB structured-clones it. */
async function copyDatabase(
    from: string,
    to: string,
    openTarget: (name: string) => Promise<IDBPDatabase>,
    existing: Set<string | undefined>,
): Promise<void> {
    // A target that already exists belongs to a newer session; it wins.
    if (!existing.has(from) || existing.has(to)) return
    const source = await openDB(from)
    const target = await openTarget(to)
    try {
        for (const name of Array.from(source.objectStoreNames)) {
            if (!target.objectStoreNames.contains(name)) continue
            const read = source.transaction(name)
            const [keys, values] = await Promise.all([read.store.getAllKeys(), read.store.getAll()])
            const write = target.transaction(name, "readwrite")
            await Promise.all([...keys.map((key, i) => write.store.put(values[i], key)), write.done])
        }
    } finally {
        source.close()
        target.close()
    }
}

function deleteDatabase(name: string): Promise<void> {
    // Settles on `blocked` rather than hang the switch: a tab still running an
    // earlier build holds the database open. The next switch retries.
    return new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(name)
        request.onsuccess = request.onerror = request.onblocked = () => resolve()
    })
}
