import { describe, expect, it } from "vitest"

import { HistoryArchiveAdapter } from "@/adapters/e2ee/history-archive.adapter"

// Trimmed BIP-39 word list — content doesn't matter for these tests,
// just stable bytes to feed Argon2id.
const SAMPLE_PASSPHRASE = [
    "abandon", "ability", "able", "about", "above", "absent",
    "absorb", "abstract", "absurd", "abuse", "access", "accident",
    "account", "accuse", "achieve", "acid", "acoustic", "acquire",
    "across", "act", "action", "actor", "actress", "actual",
]
const SALT = new Uint8Array(16).fill(7)

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

    it("encrypt then decrypt round-trips plaintext", async () => {
        const a = new HistoryArchiveAdapter()
        const key = await a.deriveKey(SAMPLE_PASSPHRASE, SALT)
        const plaintext = new TextEncoder().encode("hello world")
        const { ciphertext, nonce } = await a.encrypt(key, plaintext)
        const decoded = await a.decrypt(key, ciphertext, nonce)
        expect(Array.from(decoded)).toEqual(Array.from(plaintext))
    })

    it("decrypt with wrong key throws", async () => {
        const a = new HistoryArchiveAdapter()
        const key = await a.deriveKey(SAMPLE_PASSPHRASE, SALT)
        const wrong = await a.deriveKey(SAMPLE_PASSPHRASE, new Uint8Array(16).fill(9))
        const { ciphertext, nonce } = await a.encrypt(key, new TextEncoder().encode("x"))
        await expect(a.decrypt(wrong, ciphertext, nonce)).rejects.toThrow()
    })

    it("each encrypt produces a fresh nonce", async () => {
        const a = new HistoryArchiveAdapter()
        const key = await a.deriveKey(SAMPLE_PASSPHRASE, SALT)
        const a1 = await a.encrypt(key, new TextEncoder().encode("x"))
        const a2 = await a.encrypt(key, new TextEncoder().encode("x"))
        expect(a1.nonce).not.toEqual(a2.nonce)
    })
})
