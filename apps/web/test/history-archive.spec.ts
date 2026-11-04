import { describe, expect, it } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"
import { hkdf } from "@noble/hashes/hkdf.js"
import { hmac } from "@noble/hashes/hmac.js"
import { sha256 } from "@noble/hashes/sha2.js"

import { verifyStrict } from "@pinai/crypto/attestation-chain.adapter"
import { approvalBytes, archiveEntryAad } from "@pinai/crypto/canonical-bytes"
import { HistoryArchiveAdapter } from "@pinai/crypto/history-archive.adapter"

// Trimmed BIP-39 word list — content doesn't matter for these tests,
// just stable bytes to feed Argon2id.
const SAMPLE_PASSPHRASE = [
    "abandon", "ability", "able", "about", "above", "absent",
    "absorb", "abstract", "absurd", "abuse", "access", "accident",
    "account", "accuse", "achieve", "acid", "acoustic", "acquire",
    "across", "act", "action", "actor", "actress", "actual",
]
const SALT = new Uint8Array(16).fill(7)
const HAK = new Uint8Array(32).fill(3)
const AAD = archiveEntryAad("11112222-3333-4444-5555-666677778888", "aaaabbbb-cccc-dddd-eeee-ffff00001111")
const encode = (text: string) => new TextEncoder().encode(text)

describe("HistoryArchiveAdapter", () => {
    it("derives a 32-byte key deterministically from (passphrase, salt)", async () => {
        const a = new HistoryArchiveAdapter()
        const k1 = await a.deriveKey(SAMPLE_PASSPHRASE, SALT)
        const k2 = await a.deriveKey(SAMPLE_PASSPHRASE, SALT)
        expect(k1).toEqual(k2)
        expect(k1.byteLength).toBe(32)
    })

    it("different salts produce different keys", async () => {
        const a = new HistoryArchiveAdapter()
        const k1 = await a.deriveKey(SAMPLE_PASSPHRASE, SALT)
        const altSalt = new Uint8Array(16).fill(8)
        const k2 = await a.deriveKey(SAMPLE_PASSPHRASE, altSalt)
        expect(k1).not.toEqual(k2)
    })

    it("gives the check value and the approval public key as the spec writes them", () => {
        const derived = new HistoryArchiveAdapter().derive(HAK)

        expect(derived.checkValue).toEqual(hmac(sha256, HAK, encode("pinai/history-archive/check-v1")))
        const seed = hkdf(sha256, HAK, new Uint8Array(32), encode("pinai/device-approval/v1"), 32)
        expect(derived.approvalPublicKey).toEqual(ed25519.getPublicKey(seed))
    })

    it("approves with the key whose public half it gives, strictly verifiable", () => {
        const a = new HistoryArchiveAdapter()
        const bytes = approvalBytes("https://idp.test/users/alice", "550e8400-e29b-41d4-a716-446655440000", new Uint8Array(32))

        const signature = a.signApproval(HAK, bytes)

        expect(verifyStrict(signature, bytes, a.derive(HAK).approvalPublicKey)).toBe(true)
        expect(verifyStrict(signature, bytes, a.derive(new Uint8Array(32).fill(4)).approvalPublicKey)).toBe(false)
    })

    it("encrypt then decrypt round-trips plaintext under the same associated data", async () => {
        const a = new HistoryArchiveAdapter()
        const plaintext = encode("hello world")
        const { ciphertext, nonce } = await a.encrypt(HAK, plaintext, AAD)
        expect(Array.from(await a.decrypt(HAK, ciphertext, nonce, AAD))).toEqual(Array.from(plaintext))
    })

    it("decrypt with the wrong key or other associated data throws", async () => {
        const a = new HistoryArchiveAdapter()
        const { ciphertext, nonce } = await a.encrypt(HAK, encode("x"), AAD)
        await expect(a.decrypt(new Uint8Array(32).fill(9), ciphertext, nonce, AAD)).rejects.toThrow()
        const moved = archiveEntryAad("11112222-3333-4444-5555-666677778888", "99990000-cccc-dddd-eeee-ffff00001111")
        await expect(a.decrypt(HAK, ciphertext, nonce, moved)).rejects.toThrow()
    })

    it("each encrypt produces a fresh nonce", async () => {
        const a = new HistoryArchiveAdapter()
        const a1 = await a.encrypt(HAK, encode("x"), AAD)
        const a2 = await a.encrypt(HAK, encode("x"), AAD)
        expect(a1.nonce).not.toEqual(a2.nonce)
    })
})
