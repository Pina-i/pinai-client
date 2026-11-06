/**
 * Behavioural contract for the encrypted E2EE store.
 *
 * Written against the pre-split `IndexedDbStorageAdapter` and kept unchanged
 * through the split into `SealedStorage` + `IKeyValueStore`, so it is the
 * evidence that the split preserved behaviour. It is also the first coverage
 * this store has ever had —
 * jsdom ships no IndexedDB, so `fake-indexeddb` stands in (the same
 * structured-clone semantics, in memory).
 *
 * Every row here is encrypted at rest, so these assertions are really about
 * the seal/store/open round trip, not just about plumbing.
 */
import { beforeEach, describe, expect, it } from "vitest"
import "fake-indexeddb/auto"

import { WebCryptoDeviceKeyAdapter } from "@/adapters/e2ee/device-key.adapter"
import { SealedStorage } from "@pinai/crypto/sealed-storage"
import type { DeviceAttestation, KeptPassphrase, MlsSnapshot, PendingPassphrase } from "@pinai/crypto/sealed-storage"
import type { IDeviceKeyPort } from "@pinai/domain/ports/device-key.port"
import type { IKeyValueStore } from "@pinai/domain/ports/key-value-store.port"
import { IdbKeyValueStore, e2eeDatabaseName } from "@/adapters/storage/idb-key-value-store.adapter"
import type { ConversationId, IdentityKeypair } from "@pinai/domain/models/e2ee"
import { asActorUri } from "@pinai/domain/models/identity"

function bytes(seed: number, length = 32): Uint8Array {
    return Uint8Array.from({ length }, (_, i) => (seed + i) % 256)
}

const KEYPAIR: IdentityKeypair = {
    msk_public: bytes(1),
    msk_private: bytes(2),
    ssk_public: bytes(3),
    ssk_private: bytes(4),
    ssk_signature: bytes(5, 64),
    usk_public: bytes(6),
    usk_private: bytes(7),
    usk_signature: bytes(8, 64),
}

const SNAPSHOT: MlsSnapshot = {
    provider_state: bytes(9, 128),
    known_group_ids: ["11112222-3333-4444-5555-666677778888" as ConversationId],
}

const ATTESTATION: DeviceAttestation = {
    drk_public: bytes(10),
    drk_private: bytes(11),
    signature: bytes(12, 64),
    kid: "key-2026-01",
    issued_at: "2026-01-01T00:00:00Z",
    expires_at: "2027-01-01T00:00:00Z",
    signed_message: bytes(13, 96),
    hpke: { public_key: bytes(14), private_key: bytes(15) },
}

const WORDS = Array.from({ length: 24 }, (_, i) => `word${i + 1}`)

const KEPT: KeptPassphrase = {
    words: WORDS,
    generation: 2,
    approvedRootKey: bytes(18),
    derived: { salt: bytes(16, 16), hak: bytes(17) },
}

const PENDING: PendingPassphrase = {
    words: WORDS,
    key: { generation: 1, salt: bytes(19, 16), checkValue: bytes(20), approvalPublicKey: bytes(21) },
    hak: bytes(22),
    mintedAt: 1_762_300_000_000,
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
const PIERRE = asActorUri("https://idp.example/users/pierre")

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

describe("device identity", () => {
    it("mints a device id once and keeps returning it", async () => {
        const first = await storage.getOrCreateDeviceId()
        expect(first).toMatch(/^[0-9a-f-]{36}$/)
        expect(await storage.getOrCreateDeviceId()).toBe(first)
    })

    it("mints one device id however many callers ask at once", async () => {
        const ids = await Promise.all(Array.from({ length: 4 }, () => storage.getOrCreateDeviceId()))

        expect(new Set(ids).size).toBe(1)
        expect(await webStorage().getOrCreateDeviceId()).toBe(ids[0])
    })

    it("sees the device id a previous instance persisted", async () => {
        const id = await storage.getOrCreateDeviceId()
        expect(await webStorage().getOrCreateDeviceId()).toBe(id)
    })
})

describe("sealed rows", () => {
    it("round-trips an identity keypair, preserving every Uint8Array", async () => {
        await storage.saveIdentityKeypair(KEYPAIR)
        const loaded = await storage.loadIdentityKeypair()
        expect(loaded).toEqual(KEYPAIR)
        expect(loaded!.msk_private).toBeInstanceOf(Uint8Array)
    })

    it("round-trips an MLS snapshot", async () => {
        await storage.saveMlsSnapshot(SNAPSHOT)
        const loaded = await storage.loadMlsSnapshot()
        expect(loaded).toEqual(SNAPSHOT)
        expect(loaded!.provider_state).toBeInstanceOf(Uint8Array)
    })

    it("round-trips a device attestation", async () => {
        await storage.saveDeviceAttestation(ATTESTATION)
        expect(await storage.loadDeviceAttestation()).toEqual(ATTESTATION)
    })

    it("round-trips the kept and pending words, the standing and the newest generation seen", async () => {
        await storage.saveKeptPassphrase(KEPT)
        await storage.savePendingPassphrase(PENDING)
        await storage.saveHistoryKeyStanding({
            kind: "mismatch",
            generation: 3,
            setByDevice: "d2",
            reason: "rollback",
            held: 2,
        })
        await storage.saveNewestHistoryGeneration(3)

        const kept = await storage.loadKeptPassphrase()
        expect(kept).toEqual(KEPT)
        expect(kept!.derived.hak).toBeInstanceOf(Uint8Array)
        expect(await storage.loadPendingPassphrase()).toEqual(PENDING)
        expect(await storage.loadHistoryKeyStanding()).toMatchObject({ kind: "mismatch", reason: "rollback" })
        expect(await storage.loadNewestHistoryGeneration()).toBe(3)
        await storage.clearPendingPassphrase()
        expect(await storage.loadPendingPassphrase()).toBeNull()
    })

    it("reads a pending row written before its time was kept as minted at no known time, and keeps the new words' generation", async () => {
        const { words, key, hak } = PENDING
        const row = {
            words,
            generation: key.generation,
            salt: Array.from(key.salt),
            check_value: Array.from(key.checkValue),
            approval_public_key: Array.from(key.approvalPublicKey),
            hak: Array.from(hak),
        }
        await storage["seal"]("recovery_passphrase", row, "pending")
        expect(await storage.loadPendingPassphrase()).toEqual({ ...PENDING, mintedAt: null })

        await storage.saveNewWordsGeneration(3)
        expect(await storage.loadNewWordsGeneration()).toBe(3)
        await storage.clearNewWordsGeneration()
        expect(await storage.loadNewWordsGeneration()).toBeNull()
    })

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

    it("adds to what it keeps of the account's devices, and starts with nothing", async () => {
        expect(await storage.loadDeviceTrust()).toEqual({
            trust: { seen: [], approved: [], revoked: [], partners: [], baselines: [], before: [] },
            unreadable: [],
        })

        await storage.addToDeviceTrust({ seen: [{ deviceId: "phone", rootKey: bytes(30) }], approved: [{ deviceId: "phone", rootKey: bytes(30) }] })
        const partner = { deviceId: "laptop", rootKey: bytes(32), hpkeKey: bytes(33) }
        const before = { generation: 2, cause: "start-over" as const, devices: [{ deviceId: "phone", rootKey: bytes(30) }], refused: [{ deviceId: "watch", rootKey: bytes(34) }] }
        const added = await storage.addToDeviceTrust({
            approved: [{ deviceId: "tablet", rootKey: bytes(31) }],
            revoked: ["watch"],
            partners: [partner],
            baselines: [2],
            before: [before],
        })
        await storage.addToDeviceTrust({ partners: [{ ...partner }], baselines: [2], before: [{ generation: 2, cause: "replacement", devices: [], refused: [] }] })

        const trust = {
            seen: [{ deviceId: "phone", rootKey: bytes(30) }],
            approved: [
                { deviceId: "phone", rootKey: bytes(30) },
                { deviceId: "tablet", rootKey: bytes(31) },
            ],
            revoked: ["watch"],
            partners: [partner],
            baselines: [2],
            before: [before],
        }
        expect(added).toEqual(trust)
        expect(await storage.loadDeviceTrust()).toEqual({ trust, unreadable: [] })
        expect((await storage.loadDeviceTrust()).trust.approved[1].rootKey).toBeInstanceOf(Uint8Array)
        expect((await storage.loadDeviceTrust()).trust.partners[0].hpkeKey).toBeInstanceOf(Uint8Array)
        expect((await storage.loadDeviceTrust()).trust.before[0].devices[0].rootKey).toBeInstanceOf(Uint8Array)
        expect((await storage.loadDeviceTrust()).trust.before[0].refused[0].rootKey).toBeInstanceOf(Uint8Array)
        expect(await rowsOf("device_attestation")).toEqual(expect.arrayContaining(["trust:partners", "trust:baselines", "trust:before"]))
    })

    it("keeps what another tab added meanwhile: each row read again just before it is written", async () => {
        const otherTab = webStorage()
        await storage.loadDeviceTrust()
        await otherTab.loadDeviceTrust()

        await otherTab.addToDeviceTrust({ revoked: ["watch"], seen: [{ deviceId: "phone", rootKey: bytes(30) }] })
        await storage.addToDeviceTrust({ revoked: ["tablet"], seen: [{ deviceId: "tablet", rootKey: bytes(31) }] })

        const { trust } = await webStorage().loadDeviceTrust()
        expect(trust.revoked).toEqual(["watch", "tablet"])
        expect(trust.seen.map((d) => d.deviceId)).toEqual(["phone", "tablet"])
    })

    it("sets aside, never deletes, a trust row it can't read, names it, and reads the others", async () => {
        await storage.addToDeviceTrust({ seen: [{ deviceId: "phone", rootKey: bytes(30) }], revoked: ["watch"] })
        await storage["seal"]("device_attestation", { devices: [{ device_id: "phone", root_key: [1, 2] }] }, "trust:approved")
        await storage["seal"]("device_attestation", { before: [{ generation: 0, devices: [] }] }, "trust:before")
        const kv = new IdbKeyValueStore(e2eeDatabaseName(ALICE))
        await kv.put("device_attestation", "trust:revoked", bytes(42, 64))

        expect(await storage.loadDeviceTrust()).toEqual({
            trust: { seen: [{ deviceId: "phone", rootKey: bytes(30) }], approved: [], revoked: [], partners: [], baselines: [], before: [] },
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

    it("round-trips the bound actor uri", async () => {
        expect(await storage.getBoundActorUri()).toBeNull()
        const actor = asActorUri("https://idp.example/users/alice")
        await storage.setBoundActorUri(actor)
        expect(await storage.getBoundActorUri()).toBe(actor)
    })

    it("replaces rather than appends on re-save", async () => {
        await storage.saveIdentityKeypair(KEYPAIR)
        const replacement = { ...KEYPAIR, msk_public: bytes(99) }
        await storage.saveIdentityKeypair(replacement)
        expect(await storage.loadIdentityKeypair()).toEqual(replacement)
    })

    it("returns null for every row on a fresh device", async () => {
        expect(await storage.loadIdentityKeypair()).toBeNull()
        expect(await storage.loadMlsSnapshot()).toBeNull()
        expect(await storage.loadDeviceAttestation()).toBeNull()
        expect(await storage.loadKeptPassphrase()).toBeNull()
        expect(await storage.loadHistoryKeyStanding()).toBeNull()
    })

    it("stores rows encrypted — the plaintext is not recoverable from the row", async () => {
        await storage.saveKeptPassphrase(KEPT)
        const db = await indexedDB.databases?.().then(() => undefined)
        void db
        const raw = await new Promise<unknown>((resolve, reject) => {
            const req = indexedDB.open(e2eeDatabaseName(ALICE))
            req.onerror = () => reject(req.error)
            req.onsuccess = () => {
                const get = req.result
                    .transaction("recovery_passphrase", "readonly")
                    .objectStore("recovery_passphrase")
                    .get("current")
                get.onsuccess = () => {
                    req.result.close()
                    resolve(get.result)
                }
                get.onerror = () => reject(get.error)
            }
        })
        expect(JSON.stringify(raw)).not.toContain("word1")
    })
})

describe("per-account stores", () => {
    it("keeps each account's device when another account uses the same browser", async () => {
        const pierre = webStorage(PIERRE)
        await pierre.clear()
        await storage.saveIdentityKeypair(KEYPAIR)
        await storage.setBoundActorUri(ALICE)

        expect(await pierre.loadIdentityKeypair()).toBeNull()
        await pierre.saveIdentityKeypair({ ...KEYPAIR, msk_public: bytes(42) })
        await pierre.clear()

        expect(await webStorage(ALICE).loadIdentityKeypair()).toEqual(KEYPAIR)
        expect(await webStorage(ALICE).getBoundActorUri()).toBe(ALICE)
    })

    it("opens nothing before an account has signed in", async () => {
        await expect(new IdbKeyValueStore(null).get("meta", "device_id")).rejects.toThrow(/sign in/)
    })
})

describe("clear", () => {
    it("wipes every row, including the device identity", async () => {
        const deviceId = await storage.getOrCreateDeviceId()
        await storage.saveIdentityKeypair(KEYPAIR)
        await storage.saveMlsSnapshot(SNAPSHOT)
        await storage.saveDeviceAttestation(ATTESTATION)
        await storage.saveKeptPassphrase(KEPT)
        await storage.addToDeviceTrust({ revoked: ["watch"] })

        await storage.clear()

        expect((await storage.loadDeviceTrust()).trust).toEqual({ seen: [], approved: [], revoked: [], partners: [], baselines: [], before: [] })
        expect(await storage.loadIdentityKeypair()).toBeNull()
        expect(await storage.loadMlsSnapshot()).toBeNull()
        expect(await storage.loadDeviceAttestation()).toBeNull()
        expect(await storage.loadKeptPassphrase()).toBeNull()
        expect(await storage.getOrCreateDeviceId()).not.toBe(deviceId)
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
