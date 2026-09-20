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
 * - Recovery Key wrap/unwrap — Argon2id integration is a separate turn.
 * - SPAKE2 pairing — separate turn.
 */

import { beforeAll, describe, expect, it } from "vitest"

import { loadWasmModule } from "./setup/wasm"

import { NobleIdentityAdapter } from "@/adapters/e2ee/identity.adapter"
import { MlsAdapter } from "@/adapters/e2ee/mls.adapter"
import { asActorUri } from "@/domain/models/identity"
import { DEFAULT_ARGON2_PARAMS, NobleRecoveryAdapter } from "@/adapters/e2ee/recovery.adapter"

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

async function makeAdapter(actorUri: string): Promise<MlsAdapter> {
    const a = new MlsAdapter()
    await a.initialize({ module_or_path: wasmModule } as never)
    // `deviceId` is not optional: it goes into the leaf credential, and
    // omitting it produced credential bytes no production build would emit.
    await a.setIdentity(asActorUri(actorUri), `${actorUri}#device-1`)
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
        const alice = await makeAdapter("alice@idp.example.com")
        const bob = await makeAdapter("bob@idp.example.com")

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

    it("recoverFromMsk derives the same MSK public", () => {
        const idAdapter = new NobleIdentityAdapter()
        const original = idAdapter.generate()
        const recovered = idAdapter.recoverFromMsk(original.msk_private)
        // Same MSK private → same MSK public → same fingerprint, even
        // though SSK + USK are rotated.
        expect(recovered.msk_public).toEqual(original.msk_public)
        expect(idAdapter.fingerprint(recovered.msk_public)).toBe(
            idAdapter.fingerprint(original.msk_public),
        )
        // SSK + USK are fresh, so their bytes differ.
        expect(recovered.ssk_public).not.toEqual(original.ssk_public)
        expect(recovered.usk_public).not.toEqual(original.usk_public)
        // The fresh SSK + USK still validate under the same MSK.
        expect(idAdapter.validatePublicKeys(idAdapter.publicKeys(recovered))).toBe(true)
    })

    it("export_secret returns matching bytes on both sides", async () => {
        const alice = await makeAdapter("alice@idp.example.com")
        const bob = await makeAdapter("bob@idp.example.com")
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

describe("recovery adapter — Argon2id wrap / XChaCha20-Poly1305 round trip", () => {
    // Test-only Argon2id params — the spec's m=64 MiB / t=3 default is
    // intentionally slow on real hardware and would dominate the test
    // suite's wall time. Production paths use DEFAULT_ARGON2_PARAMS.
    const FAST_PARAMS = { m_kib: 64, t: 1, p: 1 }

    const recovery = new NobleRecoveryAdapter()

    it("round-trips an MSK private with the right passphrase", async () => {
        const msk = new Uint8Array(32)
        crypto.getRandomValues(msk)

        const blob = await recovery.wrap(msk, "correct horse battery staple", FAST_PARAMS)
        const restored = await recovery.unwrap(blob, "correct horse battery staple")
        expect(restored).toEqual(msk)
    })

    it("rejects the wrong passphrase with a single user-friendly error", async () => {
        const msk = new Uint8Array(32)
        crypto.getRandomValues(msk)
        const blob = await recovery.wrap(msk, "real-passphrase", FAST_PARAMS)
        await expect(recovery.unwrap(blob, "wrong-passphrase")).rejects.toThrow(
            /wrong passphrase or corrupt data/i,
        )
    })

    it("rejects a tampered ciphertext", async () => {
        const msk = new Uint8Array(32)
        crypto.getRandomValues(msk)
        const blob = await recovery.wrap(msk, "real-passphrase", FAST_PARAMS)
        // Flip a byte mid-ciphertext (after the 24-byte nonce).
        blob.wrapped_msk[30] ^= 0x01
        await expect(recovery.unwrap(blob, "real-passphrase")).rejects.toThrow(
            /wrong passphrase or corrupt data/i,
        )
    })

    it("emits a fresh salt + nonce on each wrap (deterministic input → different blobs)", async () => {
        const msk = new Uint8Array(32)
        crypto.getRandomValues(msk)
        const a = await recovery.wrap(msk, "same-passphrase", FAST_PARAMS)
        const b = await recovery.wrap(msk, "same-passphrase", FAST_PARAMS)
        expect(a.salt).not.toEqual(b.salt)
        expect(a.wrapped_msk).not.toEqual(b.wrapped_msk)
    })

    it("DEFAULT_ARGON2_PARAMS matches the spec's recommendation", () => {
        expect(DEFAULT_ARGON2_PARAMS).toEqual({ m_kib: 64 * 1024, t: 3, p: 4 })
    })
})
