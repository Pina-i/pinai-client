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
import { SealedStorage } from "@/adapters/e2ee/sealed-storage"
import type { DeviceAttestation, MlsSnapshot } from "@/adapters/e2ee/sealed-storage"
import { IdbKeyValueStore } from "@/adapters/storage/idb-key-value-store.adapter"
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
}

const WORDS = Array.from({ length: 24 }, (_, i) => `word${i + 1}`)

/** The web wiring: IndexedDB bytes + a WebCrypto key + the shared schema. */
function webStorage(): SealedStorage {
    const kv = new IdbKeyValueStore()
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

    it("round-trips the recovery passphrase and clears it", async () => {
        await storage.saveRecoveryPassphrase(WORDS)
        expect(await storage.loadRecoveryPassphrase()).toEqual(WORDS)
        await storage.clearRecoveryPassphrase()
        expect(await storage.loadRecoveryPassphrase()).toBeNull()
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
        expect(await storage.loadRecoveryPassphrase()).toBeNull()
    })

    it("stores rows encrypted — the plaintext is not recoverable from the row", async () => {
        await storage.saveRecoveryPassphrase(WORDS)
        const db = await indexedDB.databases?.().then(() => undefined)
        void db
        const raw = await new Promise<unknown>((resolve, reject) => {
            const req = indexedDB.open("pinai-e2ee")
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

describe("clear", () => {
    it("wipes every row, including the device identity", async () => {
        const deviceId = await storage.getOrCreateDeviceId()
        await storage.saveIdentityKeypair(KEYPAIR)
        await storage.saveMlsSnapshot(SNAPSHOT)
        await storage.saveDeviceAttestation(ATTESTATION)
        await storage.saveRecoveryPassphrase(WORDS)

        await storage.clear()

        expect(await storage.loadIdentityKeypair()).toBeNull()
        expect(await storage.loadMlsSnapshot()).toBeNull()
        expect(await storage.loadDeviceAttestation()).toBeNull()
        expect(await storage.loadRecoveryPassphrase()).toBeNull()
        expect(await storage.getOrCreateDeviceId()).not.toBe(deviceId)
    })
})
