/**
 * Device-pairing protocol tests.
 *
 * Drives the full SPAKE2 + AEAD-sealed-bundle dance end-to-end with no
 * transport layer — the test plays both roles in memory and proves
 * the new device gets the *same* `IdentityKeypair` as the existing
 * device. Plus negative cases for tampered messages.
 */

import { describe, expect, it } from "vitest"

import { NobleIdentityAdapter } from "@pinai/crypto/identity.adapter"
import { PairingInitiator, PairingResponder } from "@pinai/crypto/pairing.adapter"

describe("Device pairing", () => {
    const idAdapter = new NobleIdentityAdapter()

    it("happy path: existing → new device, identity arrives intact", () => {
        const aliceKeypair = idAdapter.generate()

        // Existing device starts the session; QR is JSON-stringified
        // in the real UI. We pass the JSON form to the responder
        // verbatim.
        const initiator = PairingInitiator.start(aliceKeypair)
        const qrJson = JSON.stringify(initiator.qrPayload)

        // New device scans QR + receives initiator's SPAKE2 message
        // through some transport. Build the responder, then send our
        // own SPAKE2 message + confirmation back.
        const responder = PairingResponder.fromQr(qrJson, initiator.ourSpakeMessage)

        // Existing device receives responder's reply, finalises, and
        // ships back the sealed bundle.
        const initiatorReply = initiator.finalize(
            responder.ourSpakeMessage,
            responder.ourConfirmation,
        )

        // New device unwraps the bundle. Result is the same MSK / SSK
        // / USK on both sides.
        const recovered = responder.finalize(
            initiatorReply.ourConfirmation,
            initiatorReply.sealedBundle,
        )

        expect(recovered.msk_public).toEqual(aliceKeypair.msk_public)
        expect(recovered.msk_private).toEqual(aliceKeypair.msk_private)
        expect(recovered.ssk_private).toEqual(aliceKeypair.ssk_private)
        expect(recovered.usk_private).toEqual(aliceKeypair.usk_private)
        // The SSK + USK signatures travel intact too — receiver can
        // re-publish identity directly without rebuilding them.
        expect(recovered.ssk_signature).toEqual(aliceKeypair.ssk_signature)
        expect(recovered.usk_signature).toEqual(aliceKeypair.usk_signature)
    })

    it("rejects pairing if the QR pair_token was tampered with mid-air", () => {
        const aliceKeypair = idAdapter.generate()
        const initiator = PairingInitiator.start(aliceKeypair)
        const goodQr = initiator.qrPayload

        // Attacker rewrites pair_token to a value of their choosing.
        const tamperedQrJson = JSON.stringify({
            ...goodQr,
            pair_token: btoa(String.fromCharCode(...new Uint8Array(32).fill(0xab))),
        })

        const responder = PairingResponder.fromQr(tamperedQrJson, initiator.ourSpakeMessage)

        // Initiator sees a confirmation built under the *real*
        // pair_token; responder built it under the tampered one. They
        // differ, so the initiator's `finalize` rejects.
        expect(() =>
            initiator.finalize(responder.ourSpakeMessage, responder.ourConfirmation),
        ).toThrow(/wrong pair_token or MITM/i)
    })

    it("responder rejects a sealed bundle whose ciphertext was flipped", () => {
        const aliceKeypair = idAdapter.generate()
        const initiator = PairingInitiator.start(aliceKeypair)
        const responder = PairingResponder.fromQr(
            JSON.stringify(initiator.qrPayload),
            initiator.ourSpakeMessage,
        )
        const reply = initiator.finalize(responder.ourSpakeMessage, responder.ourConfirmation)

        // Flip a byte in the ciphertext (after the 24-byte nonce).
        reply.sealedBundle[30] ^= 0x01

        expect(() => responder.finalize(reply.ourConfirmation, reply.sealedBundle)).toThrow(
            /AEAD verification/i,
        )
    })

    it("malformed QR payload throws cleanly", () => {
        expect(() => PairingResponder.fromQr("{}", new Uint8Array(32))).toThrow(
            /malformed or unsupported/i,
        )
        expect(() =>
            PairingResponder.fromQr(JSON.stringify({ v: 99, pair_token: "x", msk_public: "y" }), new Uint8Array(32)),
        ).toThrow(/malformed or unsupported/i)
    })
})
