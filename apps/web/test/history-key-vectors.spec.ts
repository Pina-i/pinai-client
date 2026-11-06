/**
 * Known answers for the history key's crypto (`identity-provider/specs/e2ee.md § 3.7`, § 7.2,
 * § 7.3), computed outside this codebase so a mistake in a shared library can't hide: the
 * Argon2id key with OpenSSL 3.5 (`openssl kdf … ARGON2ID`), the rest with Python's
 * `cryptography` (HMAC-SHA256, HKDF-SHA256 with `salt=None`, Ed25519, AES-GCM).
 */
import { describe, expect, it } from "vitest"

import { approvalBytes, archiveEntryAad } from "@pinai/crypto/canonical-bytes"
import { HistoryArchiveAdapter } from "@pinai/crypto/history-archive.adapter"

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
const fromHex = (text: string) => Uint8Array.from(text.match(/../g)!.map((pair) => parseInt(pair, 16)))

const WORDS = [
    "abandon", "ability", "able", "about", "above", "absent",
    "absorb", "abstract", "absurd", "abuse", "access", "accident",
    "account", "accuse", "achieve", "acid", "acoustic", "acquire",
    "across", "act", "action", "actor", "actress", "actual",
]
const HAK = Uint8Array.from({ length: 32 }, (_, i) => i)

describe("the history key's known answers", () => {
    const sealer = new HistoryArchiveAdapter()

    it("derives the HAK with Argon2id t=3, m=64 MiB, p=4 over the words joined by spaces", async () => {
        // openssl kdf -keylen 32 -kdfopt pass:"<words>" -kdfopt hexsalt:07…07 -kdfopt iter:3
        //   -kdfopt memcost:65536 -kdfopt lanes:4 ARGON2ID
        expect(hex(await sealer.deriveKey(WORDS, new Uint8Array(16).fill(7)))).toBe(
            "6b0518bcf87b3c97865e53f18d0dba3f79532669e59743744dc9df0eafc23803",
        )
    })

    it("derives the same HAK from mixed-case words with stray spaces", async () => {
        const typed = WORDS.map((word, i) => (i % 2 ? `  ${word.toUpperCase()} ` : `${word[0].toUpperCase()}${word.slice(1)}\t`))
        expect(hex(await sealer.deriveKey(typed, new Uint8Array(16).fill(7)))).toBe(
            "6b0518bcf87b3c97865e53f18d0dba3f79532669e59743744dc9df0eafc23803",
        )
    })

    it("gives the check value and the approval public key", () => {
        const derived = sealer.derive(HAK)
        expect(hex(derived.checkValue)).toBe("ac7e896ff9617baa4891f5e1cc47322be5113c10b2cd9674cd67f315b9acb4b4")
        expect(hex(derived.approvalPublicKey)).toBe("e10f6ba9bb7ee4dcad971bf15847e6ba6736d9a8bddb7f90901d4e8c775711c8")
    })

    it("signs an approval as the approval key does", () => {
        const bytes = approvalBytes(
            "https://idp.alice.test/users/alice_xk9mp",
            "550e8400-e29b-41d4-a716-446655440000",
            new Uint8Array(32).fill(1),
        )
        expect(hex(sealer.signApproval(HAK, bytes))).toBe(
            "c22cb8577210c9ab1c1a72268e605392fa876a4defcc393b4f6b82992e655a46" +
                "255f8b6701b720963d10f8c61dac41ee8d8baff5c262ff3f9a3fa1c363b3f60a",
        )
    })

    it("opens an entry sealed under its ids as associated data", async () => {
        const aad = archiveEntryAad("11112222-3333-4444-5555-666677778888", "aaaabbbb-cccc-dddd-eeee-ffff00001111")
        const sealed = fromHex("1fa6895907a50914b73c0e6e7dfcdc3789fbfb84c2e99dea28e8b6f3e5")

        const plain = await sealer.decrypt(HAK, sealed, new Uint8Array(12).fill(1), aad)

        expect(new TextDecoder().decode(plain)).toBe("hello archive")
    })
})
