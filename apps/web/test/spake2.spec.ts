/**
 * SPAKE2 protocol tests.
 *
 * Self-pairing round trips + negative cases. We deliberately don't
 * lean on the published RFC 9382 ed25519 test vectors here: those
 * pin specific `M`, `N`, role-tag, and transcript-encoding choices
 * that don't match our implementation (we use Ristretto255 +
 * domain-separated labels rather than the RFC's edwards25519 +
 * fixed-IV vectors). The wire format is internal — what matters is
 * that two of *our* clients pair correctly and an attacker who
 * doesn't know the password can't forge a confirmation.
 */

import { describe, expect, it } from "vitest"

import { Spake2 } from "@/adapters/e2ee/spake2"

describe("SPAKE2 over Ristretto255", () => {
    const password = new TextEncoder().encode("pair-token-deadbeef")

    it("two parties with the same password derive the same session key", () => {
        const alice = Spake2.start(password, "initiator")
        const bob = Spake2.start(password, "responder")

        const aliceFinal = alice.derive(bob.ourMessage)
        const bobFinal = bob.derive(alice.ourMessage)

        expect(aliceFinal.sessionKey).toEqual(bobFinal.sessionKey)
        expect(aliceFinal.sessionKey.length).toBe(32)
    })

    it("each side can verify the other's confirmation tag", () => {
        const alice = Spake2.start(password, "initiator")
        const bob = Spake2.start(password, "responder")

        const aliceFinal = alice.derive(bob.ourMessage)
        const bobFinal = bob.derive(alice.ourMessage)

        expect(aliceFinal.verifyConfirmation(bobFinal.ourConfirmation)).toBe(true)
        expect(bobFinal.verifyConfirmation(aliceFinal.ourConfirmation)).toBe(true)
    })

    it("a wrong password yields a different session key — confirmation fails", () => {
        const alice = Spake2.start(password, "initiator")
        const bob = Spake2.start(new TextEncoder().encode("wrong-token"), "responder")

        const aliceFinal = alice.derive(bob.ourMessage)
        const bobFinal = bob.derive(alice.ourMessage)

        expect(aliceFinal.sessionKey).not.toEqual(bobFinal.sessionKey)
        expect(aliceFinal.verifyConfirmation(bobFinal.ourConfirmation)).toBe(false)
        expect(bobFinal.verifyConfirmation(aliceFinal.ourConfirmation)).toBe(false)
    })

    it("two parties on the same role still both derive *some* key, but confirm fails (anti-reflection sanity)", () => {
        // Real SPAKE2 anti-reflection comes from M ≠ N, which makes
        // initiator's blind unrecoverable by another initiator. The
        // session keys end up different even with matching passwords.
        const a = Spake2.start(password, "initiator")
        const b = Spake2.start(password, "initiator")

        const aFinal = a.derive(b.ourMessage)
        const bFinal = b.derive(a.ourMessage)

        expect(aFinal.sessionKey).not.toEqual(bFinal.sessionKey)
        expect(aFinal.verifyConfirmation(bFinal.ourConfirmation)).toBe(false)
    })

    it("rejects a malformed peer message", () => {
        const alice = Spake2.start(password, "initiator")
        // Garbage bytes that don't decode as a valid Ristretto255 point.
        const bogus = new Uint8Array(32).fill(0xff)
        expect(() => alice.derive(bogus)).toThrow()
    })

    it("each handshake produces a fresh session key (random scalars are non-deterministic)", () => {
        const a1 = Spake2.start(password, "initiator")
        const b1 = Spake2.start(password, "responder")
        const k1 = a1.derive(b1.ourMessage).sessionKey

        const a2 = Spake2.start(password, "initiator")
        const b2 = Spake2.start(password, "responder")
        const k2 = a2.derive(b2.ourMessage).sessionKey

        expect(k1).not.toEqual(k2)
    })

    it("override scalar produces deterministic output (regression-test hook)", () => {
        const fixedScalar = 12345678901234567890n
        const a1 = Spake2.start(password, "initiator", fixedScalar)
        const a2 = Spake2.start(password, "initiator", fixedScalar)
        // Both alice instances use the same x → same outgoing T.
        expect(a1.ourMessage).toEqual(a2.ourMessage)
    })
})
