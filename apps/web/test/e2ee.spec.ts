/**
 * E2EE integration tests — Phase 4b foundation.
 *
 * Drives the TS adapters end-to-end against the real `openmls-wasm`
 * bundle running under jsdom. No mocking of the WASM layer; this is
 * the same code path the browser will run.
 *
 * What's covered:
 * - Identity-key generation + fingerprint shape + signature chain.
 * - Two MlsAdapter instances simulate Alice + Bob: `createGroup`,
 *   `addMember`, `joinGroup`, encrypt → decrypt round-trip.
 *
 * What's not covered yet (intentional, lands in later 4b turns):
 * - IndexedDB storage round-trip (jsdom lacks IndexedDB; pull in
 *   `fake-indexeddb/auto` when `storage.adapter.ts` gets tested).
 * - SPAKE2 pairing — separate turn.
 */

import { beforeAll, describe, expect, it } from "vitest"

import { loadWasmModule } from "./setup/wasm"

import { NobleIdentityAdapter } from "@pinai/crypto/identity.adapter"
import { MlsAdapter } from "@pinai/mls/wasm.adapter"
import { asActorUri } from "@pinai/domain/models/identity"

import { FakeIssuers, credentialFor, testDevice } from "./setup/issuers"

/**
 * Load the openmls-wasm bytes from disk and compile them once. Reused
 * across every test in this file so each test only pays for adapter
 * init. Resolved against `process.cwd()` (vitest runs from the
 * project root) — `import.meta.url` is virtualised under jsdom and
 * `fileURLToPath` rejects it.
 */
let wasmModule: WebAssembly.Module

beforeAll(async () => {
    wasmModule = await loadWasmModule()
})

const issuers = new FakeIssuers()

async function makeAdapter(actorUri: string): Promise<MlsAdapter> {
    const a = new MlsAdapter()
    await a.initialize({ module_or_path: wasmModule } as never)
    const key = await a.generateSignatureKey()
    await a.setIdentity(credentialFor(testDevice(issuers, asActorUri(actorUri)), key), key)
    return a
}

describe("identity adapter", () => {
    const adapter = new NobleIdentityAdapter()

    it("generates a 60-char base32 fingerprint", () => {
        const k = adapter.generate()
        const fp = adapter.fingerprint(k.msk_public)
        expect(fp).toMatch(/^[A-Z2-7]{60}$/)
    })

    it("validates the SSK + USK signature chain it produced", () => {
        const k = adapter.generate()
        expect(adapter.validatePublicKeys(adapter.publicKeys(k))).toBe(true)
    })

    it("rejects a tampered SSK signature", () => {
        const k = adapter.generate()
        const pub = adapter.publicKeys(k)
        // Flip a bit in the SSK signature; validation must fail.
        const tampered = new Uint8Array(pub.ssk_signature)
        tampered[0] ^= 0x01
        expect(
            adapter.validatePublicKeys({ ...pub, ssk_signature: tampered }),
        ).toBe(false)
    })

    it("emits stable fingerprints (same MSK in → same fingerprint out)", () => {
        const k = adapter.generate()
        const a = adapter.fingerprint(k.msk_public)
        const b = adapter.fingerprint(k.msk_public)
        expect(a).toBe(b)
    })
})

describe("mls adapter — two-member round trip", () => {
    const conversationId = "00112233-4455-6677-8899-aabbccddeeff"

    it("alice founds, adds bob, exchanges one application message", async () => {
        const alice = await makeAdapter("https://idp.example.com/users/alice")
        const bob = await makeAdapter("https://idp.example.com/users/bob")

        // Bob publishes a KeyPackage; Alice claims it (in this test we
        // hand it over directly — the real flow goes through the IdP
        // key directory).
        const bobKeyPackageBytes = await bob.createKeyPackage()

        // Alice founds the group, adds Bob.
        await alice.createGroup(conversationId)
        const add = await alice.addMember(conversationId, bobKeyPackageBytes)
        await alice.mergePendingCommit(conversationId)

        // Bob joins from the welcome + ratchet tree.
        await bob.joinGroup(conversationId, add.welcome, add.ratchet_tree)

        expect(await alice.getEpoch(conversationId)).toBe(await bob.getEpoch(conversationId))

        // Alice encrypts → Bob decrypts.
        const plaintext = new TextEncoder().encode("hello bob, encrypted")
        const ciphertext = await alice.encryptApplication(conversationId, plaintext)

        const outcome = await bob.processMessage(conversationId, ciphertext)
        expect(outcome.kind).toBe("application")
        if (outcome.kind === "application") {
            expect(new TextDecoder().decode(outcome.plaintext)).toBe(
                "hello bob, encrypted",
            )
        }
    })

    it("export_secret returns matching bytes on both sides", async () => {
        const alice = await makeAdapter("https://idp.example.com/users/alice")
        const bob = await makeAdapter("https://idp.example.com/users/bob")
        const bobKp = await bob.createKeyPackage()
        await alice.createGroup(conversationId)
        const add = await alice.addMember(conversationId, bobKp)
        await alice.mergePendingCommit(conversationId)
        await bob.joinGroup(conversationId, add.welcome, add.ratchet_tree)

        const aliceKey = await alice.exportSecret(
            conversationId,
            "pinai/attachment-key/v1",
            new TextEncoder().encode("attachment-uuid-deadbeef"),
            32,
        )
        const bobKey = await bob.exportSecret(
            conversationId,
            "pinai/attachment-key/v1",
            new TextEncoder().encode("attachment-uuid-deadbeef"),
            32,
        )
        expect(aliceKey).toEqual(bobKey)
        expect(aliceKey.length).toBe(32)
    })
})

describe("mls adapter — what a device checks of a leaf", () => {
    const conversationId = "00112233-4455-6677-8899-aabbccddeeff"
    const bobActor = asActorUri("https://idp.example.com/users/bob")

    it("shows a KeyPackage's credential and the signature key its leaf carries", async () => {
        const bob = new MlsAdapter()
        await bob.initialize({ module_or_path: wasmModule } as never)
        const key = await bob.generateSignatureKey()
        const credential = credentialFor(testDevice(issuers, bobActor), key)
        await bob.setIdentity(credential, key)

        const leaf = await bob.inspectKeyPackage(await bob.createKeyPackage())

        expect(leaf).toEqual({ credential, signatureKey: key })
        await expect(bob.inspectKeyPackage(new Uint8Array([1, 2, 3]))).rejects.toThrow()
    })

    it("refuses to bind a signature key it doesn't hold", async () => {
        const bob = new MlsAdapter()
        await bob.initialize({ module_or_path: wasmModule } as never)
        const stranger = new Uint8Array(32).fill(3)

        await expect(bob.setIdentity(credentialFor(testDevice(issuers, bobActor), stranger), stranger)).rejects.toThrow()
    })

    it("hands the members a commit's new leaf, and lists each leaf with this device's own marked", async () => {
        const alice = await makeAdapter("https://idp.example.com/users/alice")
        const bob = await makeAdapter("https://idp.example.com/users/bob")
        const carol = await makeAdapter("https://idp.example.com/users/carol")
        await alice.createGroup(conversationId)
        const addBob = await alice.addMember(conversationId, await bob.createKeyPackage())
        await alice.mergePendingCommit(conversationId)
        await bob.joinGroup(conversationId, addBob.welcome, null)
        const carolsPackage = await carol.createKeyPackage()
        const addCarol = await alice.addMember(conversationId, carolsPackage)
        await alice.mergePendingCommit(conversationId)

        const outcome = await bob.processMessage(conversationId, addCarol.commit)

        const carolsLeaf = await carol.inspectKeyPackage(carolsPackage)
        expect(outcome).toEqual({ kind: "commit", leavesMet: [{ leafIndex: 2, own: false, ...carolsLeaf }] })
        const leaves = await bob.groupLeaves(conversationId)
        expect(leaves.map((l) => [l.leafIndex, l.own])).toEqual([[0, false], [1, true], [2, false]])
        expect(await bob.ownLeafSignatureKey()).toEqual(leaves[1].signatureKey)
        expect(leaves[2].credential?.actor_uri).toBe("https://idp.example.com/users/carol")
    })

    it("puts a new credential in its own leaf, over the key the leaf carries", async () => {
        const alice = await makeAdapter("https://idp.example.com/users/alice")
        const bob = await makeAdapter("https://idp.example.com/users/bob")
        await alice.createGroup(conversationId)
        const add = await alice.addMember(conversationId, await bob.createKeyPackage())
        await alice.mergePendingCommit(conversationId)
        await bob.joinGroup(conversationId, add.welcome, null)
        const [own] = await alice.groupLeaves(conversationId)
        const renewed = credentialFor(testDevice(issuers, asActorUri("https://idp.example.com/users/alice")), own.signatureKey)

        const commit = await alice.updateOwnCredential(conversationId, renewed)
        await alice.mergePendingCommit(conversationId)
        const outcome = await bob.processMessage(conversationId, commit)

        expect(outcome).toEqual({
            kind: "commit",
            leavesMet: [{ leafIndex: 0, own: false, credential: renewed, signatureKey: own.signatureKey }],
        })
        const after = await bob.processMessage(
            conversationId,
            await alice.encryptApplication(conversationId, new TextEncoder().encode("same key")),
        )
        expect(after.kind).toBe("application")
    })
})
