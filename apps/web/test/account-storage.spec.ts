/**
 * Device storage is kept per account, so a second account signing in on the
 * same browser no longer erases the first one's device. Covers the switch the
 * route guard makes before anything reads storage, and the one-time hand-over
 * of the single store earlier builds shared between every account.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import "fake-indexeddb/auto"
import { openDB } from "idb"

import { WebCryptoDeviceKeyAdapter } from "@/adapters/e2ee/device-key.adapter"
import { BrowserAccountStorageAdapter } from "@/adapters/storage/account-storage-browser.adapter"
import {
    LEGACY_SLICES_DATABASE,
    createEncryptedIdbStorage,
    openSlicesDatabase,
    slicesDatabaseName,
} from "@/adapters/storage/encrypted-idb-storage.adapter"
import {
    IdbKeyValueStore,
    LEGACY_E2EE_DATABASE,
    e2eeDatabaseName,
} from "@/adapters/storage/idb-key-value-store.adapter"
import { SealedStorage } from "@pinai/crypto/sealed-storage"
import type { IdentityKeypair } from "@pinai/domain/models/e2ee"
import { asActorUri } from "@pinai/domain/models/identity"
import type { IAccountStoragePort } from "@pinai/domain/ports/account-storage.port"
import { openAccountStorageUseCase } from "@pinai/domain/usecases/e2ee/open-account-storage.usecase"

const ALICE = asActorUri("http://localhost:8080/users/Alice_hdXXU")
const PIERRE = asActorUri("http://localhost:8080/users/Pierre_C7HSG")

function keypair(seed: number): IdentityKeypair {
    const b = (s: number, n = 32) => Uint8Array.from({ length: n }, (_, i) => (seed + s + i) % 256)
    return {
        msk_public: b(1),
        msk_private: b(2),
        ssk_public: b(3),
        ssk_private: b(4),
        ssk_signature: b(5, 64),
        usk_public: b(6),
        usk_private: b(7),
        usk_signature: b(8, 64),
    }
}

/** Runs `fn` against one database's sealed store, then releases the handle so it can be deleted. */
async function withStore<T>(name: string, fn: (storage: SealedStorage) => Promise<T>): Promise<T> {
    const kv = new IdbKeyValueStore(name)
    try {
        return await fn(new SealedStorage(kv, new WebCryptoDeviceKeyAdapter(kv)))
    } finally {
        kv.close()
    }
}

async function databaseNames(): Promise<(string | undefined)[]> {
    return (await indexedDB.databases()).map((db) => db.name)
}

/** `switchTo` reloads the page and never resolves; the reload is where it ends. */
async function switchTo(actorUri: typeof ALICE): Promise<void> {
    const reload = vi.fn()
    void new BrowserAccountStorageAdapter(reload).switchTo(actorUri)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
}

beforeEach(async () => {
    localStorage.clear()
    for (const name of await databaseNames()) {
        if (name) await new Promise((resolve) => (indexedDB.deleteDatabase(name).onsuccess = resolve))
    }
})

describe("openAccountStorageUseCase", () => {
    function port(open: typeof ALICE | null): IAccountStoragePort {
        return { openAccount: () => open, switchTo: vi.fn().mockResolvedValue(undefined) }
    }

    it("leaves storage alone when the signed-in account's is already open", async () => {
        const accountStoragePort = port(ALICE)
        await openAccountStorageUseCase({ accountStoragePort })(ALICE)
        expect(accountStoragePort.switchTo).not.toHaveBeenCalled()
    })

    it("switches when another account's storage is open", async () => {
        const accountStoragePort = port(PIERRE)
        await openAccountStorageUseCase({ accountStoragePort })(ALICE)
        expect(accountStoragePort.switchTo).toHaveBeenCalledWith(ALICE)
    })

    it("switches on the first sign-in on a device", async () => {
        const accountStoragePort = port(null)
        await openAccountStorageUseCase({ accountStoragePort })(ALICE)
        expect(accountStoragePort.switchTo).toHaveBeenCalledWith(ALICE)
    })
})

describe("BrowserAccountStorageAdapter", () => {
    it("opens no account before the first sign-in", () => {
        expect(new BrowserAccountStorageAdapter(vi.fn()).openAccount()).toBeNull()
    })

    it("opens the account the last switch recorded, on the next page load", async () => {
        await switchTo(ALICE)
        expect(new BrowserAccountStorageAdapter(vi.fn()).openAccount()).toBe(ALICE)
    })

    it("hands the pre-split store to the account it is bound to, device key included", async () => {
        const identity = keypair(1)
        await withStore(LEGACY_E2EE_DATABASE, async (legacy) => {
            await legacy.saveIdentityKeypair(identity)
            await legacy.setBoundActorUri(ALICE)
        })
        const cache = await openSlicesDatabase(LEGACY_SLICES_DATABASE)
        await cache.put("slices", { opaque: [1, 2, 3] }, "pinai-app-state")
        cache.close()

        // Whoever signs in next, the old store goes to the account that owns it.
        await switchTo(PIERRE)

        // Decrypting proves the device key moved with the rows it sealed.
        expect(await withStore(e2eeDatabaseName(ALICE), (s) => s.loadIdentityKeypair())).toEqual(identity)
        const aliceCache = await openDB(slicesDatabaseName(ALICE))
        expect(await aliceCache.get("slices", "pinai-app-state")).toEqual({ opaque: [1, 2, 3] })
        aliceCache.close()
        const names = await databaseNames()
        expect(names).not.toContain(LEGACY_E2EE_DATABASE)
        expect(names).not.toContain(LEGACY_SLICES_DATABASE)
    })

    it("drops a pre-split store that no account is bound to", async () => {
        await withStore(LEGACY_E2EE_DATABASE, (legacy) => legacy.getOrCreateDeviceId())

        await switchTo(ALICE)

        expect(await databaseNames()).toEqual([])
    })

    it("keeps an account's own store over the pre-split copy", async () => {
        const current = keypair(2)
        await withStore(e2eeDatabaseName(ALICE), (s) => s.saveIdentityKeypair(current))
        await withStore(LEGACY_E2EE_DATABASE, async (legacy) => {
            await legacy.saveIdentityKeypair(keypair(3))
            await legacy.setBoundActorUri(ALICE)
        })

        await switchTo(ALICE)

        expect(await withStore(e2eeDatabaseName(ALICE), (s) => s.loadIdentityKeypair())).toEqual(current)
        expect(await databaseNames()).not.toContain(LEGACY_E2EE_DATABASE)
    })
})

describe("message cache before the first sign-in", () => {
    it("reads and writes nothing", async () => {
        const kv = new IdbKeyValueStore(null)
        const cache = createEncryptedIdbStorage<{ n: number }>(new WebCryptoDeviceKeyAdapter(kv), null)

        await cache.setItem("pinai-app-state", { state: { n: 1 }, version: 1 })

        expect(await cache.getItem("pinai-app-state")).toBeNull()
        expect(await databaseNames()).toEqual([])
    })
})
