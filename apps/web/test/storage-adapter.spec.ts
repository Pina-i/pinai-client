/**
 * What only the web's encrypted store shows: the set-aside rows by name (the port can't list a
 * collection), a store before any account signed in, databases other tabs hold, and a key that
 * can't load. Everything else — the round trips, per-account stores, clear — is the storage
 * contract (`storage-contract.spec.ts`).
 */
import { beforeEach, describe, expect, it } from "vitest"
import "fake-indexeddb/auto"

import { WebCryptoDeviceKeyAdapter } from "@/adapters/e2ee/device-key.adapter"
import { SealedStorage } from "@pinai/crypto/sealed-storage"
import type { KeptPassphrase } from "@pinai/crypto/sealed-storage"
import type { IDeviceKeyPort } from "@pinai/domain/ports/device-key.port"
import type { IKeyValueStore } from "@pinai/domain/ports/key-value-store.port"
import { IdbKeyValueStore, e2eeDatabaseName } from "@/adapters/storage/idb-key-value-store.adapter"
import { asActorUri } from "@pinai/domain/models/identity"

function bytes(seed: number, length = 32): Uint8Array {
    return Uint8Array.from({ length }, (_, i) => (seed + i) % 256)
}

const WORDS = Array.from({ length: 24 }, (_, i) => `word${i + 1}`)

const KEPT: KeptPassphrase = {
    words: WORDS,
    generation: 2,
    approvedRootKey: bytes(18),
    derived: { salt: bytes(16, 16), hak: bytes(17) },
}

/** A collection's row keys, raw: where an unreadable one is set aside. */
async function rowsOf(collection = "recovery_passphrase"): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(e2eeDatabaseName(ALICE))
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
            const keys = req.result.transaction(collection, "readonly").objectStore(collection).getAllKeys()
            keys.onsuccess = () => {
                req.result.close()
                resolve((keys.result as string[]).sort())
            }
            keys.onerror = () => reject(keys.error)
        }
    })
}

const ALICE = asActorUri("https://idp.example/users/alice")

/** The web wiring: IndexedDB bytes + a WebCrypto key + the shared schema. */
function webStorage(account = ALICE): SealedStorage {
    const kv = new IdbKeyValueStore(e2eeDatabaseName(account))
    return new SealedStorage(kv, new WebCryptoDeviceKeyAdapter(kv))
}

let storage: SealedStorage

beforeEach(async () => {
    // Isolation via `clear()` rather than `deleteDatabase`: the adapter keeps
    // its connection open and never exposes a close, so a delete would block
    // on the previous test's handle and hang the suite.
    storage = webStorage()
    await storage.clear()
})

describe("sealed rows", () => {
    it("sets aside, never deletes, a row it can't read: words alone, a short salt, 23 words", async () => {
        const seal = (value: object, key?: string) => storage["seal"]("recovery_passphrase", value, key)
        const json = { ...KEPT, approved_root_key: null, salt: Array.from(KEPT.derived.salt), hak: Array.from(KEPT.derived.hak) }

        for (const unreadable of [{ words: WORDS }, { ...json, salt: [1, 2] }, { ...json, words: WORDS.slice(1) }]) {
            await seal(unreadable)
            expect(await storage.loadKeptPassphrase()).toBeNull()
        }

        const rows = await rowsOf()
        expect(rows.filter((key) => key.startsWith("current:unreadable:"))).toHaveLength(3)
        expect(rows).not.toContain("current")
    })

    it("sets aside a row that won't open under the device key", async () => {
        const kv = new IdbKeyValueStore(e2eeDatabaseName(ALICE))
        await kv.put("recovery_passphrase", "current", bytes(40, 64))

        expect(await storage.loadKeptPassphrase()).toBeNull()
        expect((await rowsOf()).filter((key) => key.startsWith("current:unreadable:"))).toHaveLength(1)
    })

    it("sets aside, never deletes, a trust row it can't read, names it, and reads the others", async () => {
        await storage.addToDeviceTrust({ seen: [{ deviceId: "phone", rootKey: bytes(30) }], revoked: ["watch"] })
        await storage["seal"]("device_attestation", { devices: [{ device_id: "phone", root_key: [1, 2] }] }, "trust:approved")
        await storage["seal"]("device_attestation", { before: [{ generation: 0, devices: [] }] }, "trust:before")
        const kv = new IdbKeyValueStore(e2eeDatabaseName(ALICE))
        await kv.put("device_attestation", "trust:revoked", bytes(42, 64))

        expect(await storage.loadDeviceTrust()).toEqual({
            trust: {
                seen: [{ deviceId: "phone", rootKey: bytes(30) }],
                approved: [],
                revoked: [],
                partners: [],
                partnerApprovals: [],
                baselines: [],
                before: [],
            },
            unreadable: ["approved", "revoked", "before"],
        })

        const rows = await rowsOf("device_attestation")
        expect(rows.filter((key) => key.startsWith("trust:approved:unreadable:"))).toHaveLength(1)
        expect(rows.filter((key) => key.startsWith("trust:revoked:unreadable:"))).toHaveLength(1)
        expect(rows).toContain("trust:seen")
        expect(rows).not.toContain("trust:approved")
    })

    it("throws, touching nothing, when the device key can't be loaded", async () => {
        const kv: IKeyValueStore = {
            get: async () => bytes(41, 64),
            put: async () => {
                throw new Error("nothing is written")
            },
            delete: async () => {
                throw new Error("nothing is deleted")
            },
            clear: async () => undefined,
        }
        const deviceKey = { ready: async () => Promise.reject(new Error("key unreadable")) } as unknown as IDeviceKeyPort

        await expect(new SealedStorage(kv, deviceKey).loadKeptPassphrase()).rejects.toThrow("key unreadable")
    })
})

describe("per-account stores", () => {
    it("opens nothing before an account has signed in", async () => {
        await expect(new IdbKeyValueStore(null).get("meta", "device_id")).rejects.toThrow(/sign in/)
    })
})

describe("a database another tab holds", () => {
    const name = e2eeDatabaseName(asActorUri("https://idp.example/users/tabs"))

    it("lets go of its connection when a newer build asks to upgrade, and is refused at its older version after", async () => {
        const kv = new IdbKeyValueStore(name)
        await kv.put("meta", "probe", bytes(1, 4))

        const newer = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(name, 5)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
        expect(newer.version).toBe(5)
        newer.close()

        // This build's version is older now: its next open is refused, never hangs.
        await expect(kv.get("meta", "probe")).rejects.toThrow()
    })

    it("rejects instead of hanging while an older tab holds the database open", async () => {
        const older = `${name}:older`
        const held = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(older, 3)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })

        await expect(new IdbKeyValueStore(older).get("meta", "probe")).rejects.toThrow("older version")

        held.close()
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(await new IdbKeyValueStore(older).get("meta", "probe")).toBeUndefined()
    })
})
