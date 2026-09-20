/**
 * Device-pairing protocol layer (`specs/05-e2ee.md § 8`).
 *
 * Two classes: {@link PairingInitiator} (the existing device that
 * already holds the user's MSK + SSK) and {@link PairingResponder}
 * (the freshly-OIDC'd device that needs to receive the keys).
 *
 * Both are *protocol-level* — they take peer messages in as bytes
 * and emit messages out as bytes. Transport (IdP relay endpoint /
 * WebRTC / NFC / manual copy-paste) is the caller's problem; that
 * lives in the use case + UI layer.
 *
 * ## Wire shape
 *
 * QR payload (initiator → responder, displayed by initiator):
 * ```json
 * { "v": 1, "msk_public": "<base64>", "pair_token": "<base64>" }
 * ```
 *
 * Round 1 (responder → initiator):
 *   `responderHandshake` = `spake_message || confirmation`
 *   (32 + 32 = 64 bytes)
 *
 * Round 2 (initiator → responder):
 *   `initiatorHandshake` = `spake_message || confirmation || sealed_bundle`
 *   where `sealed_bundle` is XChaCha20-Poly1305 of the JSON-encoded
 *   {msk_private, ssk_private, ssk_signature, usk_private,
 *   usk_signature} under the SPAKE2 session key.
 *
 * ## What's confidential
 *
 * - `pair_token` only travels over the QR. Anyone who glimpses it
 *   while the QR is on screen can MITM the rest of the handshake.
 *   Pairing UIs should keep the QR up only as long as needed.
 * - `msk_public` is plaintext on the QR — that's fine, it's a
 *   public value.
 * - The MSK / SSK / USK private keys are *only* in the sealed
 *   bundle. SPAKE2 + AEAD makes their on-the-wire form opaque to
 *   anyone without the password.
 */

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js"
import { ed25519 } from "@noble/curves/ed25519.js"

import type { IdentityKeypair } from "@/domain/models/e2ee"

import { Spake2, type Spake2InProgress } from "./spake2"

const PROTOCOL_VERSION = 1
/** Number of random bytes the initiator picks for the SPAKE2 password. */
const PAIR_TOKEN_BYTES = 32
const SPAKE2_MESSAGE_BYTES = 32
const CONFIRMATION_BYTES = 32
const NONCE_BYTES = 24

/** AAD for the sealed bundle — domain + version tagged. */
const BUNDLE_AAD = new TextEncoder().encode("pinai/pairing/bundle-v1")

/**
 * Serialised JSON shape carried inside the AEAD-sealed bundle. Public
 * MSK travels alongside the privates so the responder can sanity-check
 * it against the QR's `msk_public` (a passive tampering-detection
 * fence in addition to SPAKE2's MITM protection).
 */
interface SealedBundleJson {
    msk_public: string
    msk_private: string
    ssk_public: string
    ssk_private: string
    ssk_signature: string
    usk_public: string
    usk_private: string
    usk_signature: string
}

export interface QrPayload {
    v: number
    msk_public: string
    pair_token: string
}

export class PairingInitiator {
    readonly qrPayload: QrPayload
    private readonly pairToken: Uint8Array
    private readonly spake: Spake2InProgress
    private readonly keypair: IdentityKeypair

    private constructor(
        qrPayload: QrPayload,
        pairToken: Uint8Array,
        spake: Spake2InProgress,
        keypair: IdentityKeypair,
    ) {
        this.qrPayload = qrPayload
        this.pairToken = pairToken
        this.spake = spake
        this.keypair = keypair
    }

    /**
     * Begin a pairing session on the existing device. The returned
     * `qrPayload` is the JSON to display in a QR code (the
     * presentation layer turns it into pixels).
     */
    static start(keypair: IdentityKeypair): PairingInitiator {
        const pairToken = crypto.getRandomValues(new Uint8Array(PAIR_TOKEN_BYTES))
        const qrPayload: QrPayload = {
            v: PROTOCOL_VERSION,
            msk_public: bytesToB64(keypair.msk_public),
            pair_token: bytesToB64(pairToken),
        }
        const spake = Spake2.start(pairToken, "initiator")
        return new PairingInitiator(qrPayload, pairToken, spake, keypair)
    }

    /** SPAKE2 message the responder needs to consume first. */
    get ourSpakeMessage(): Uint8Array {
        return this.spake.ourMessage
    }

    /**
     * Once the responder has sent its SPAKE2 message + confirmation:
     * verify the confirmation, seal the keypair under the session key,
     * and produce the bundle the responder will decrypt.
     */
    finalize(responderMessage: Uint8Array, responderConfirmation: Uint8Array): {
        ourConfirmation: Uint8Array
        sealedBundle: Uint8Array
    } {
        const derived = this.spake.derive(responderMessage)
        if (!derived.verifyConfirmation(responderConfirmation)) {
            throw new Error(
                "Pairing aborted: responder's SPAKE2 confirmation did not verify (wrong pair_token or MITM)",
            )
        }
        const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
        const cipher = xchacha20poly1305(derived.sessionKey, nonce, BUNDLE_AAD)
        const plaintext = new TextEncoder().encode(JSON.stringify(toJson(this.keypair)))
        const ciphertextWithTag = cipher.encrypt(plaintext)

        const sealed = new Uint8Array(NONCE_BYTES + ciphertextWithTag.length)
        sealed.set(nonce, 0)
        sealed.set(ciphertextWithTag, NONCE_BYTES)

        // Bind this in case future code wants the session key for an
        // additional confirmation echo.
        void this.pairToken

        return {
            ourConfirmation: derived.ourConfirmation,
            sealedBundle: sealed,
        }
    }
}

export class PairingResponder {
    readonly ourSpakeMessage: Uint8Array
    readonly ourConfirmation: Uint8Array
    private readonly sessionKey: Uint8Array
    private readonly verifyInitiator: (peer: Uint8Array) => boolean
    private readonly expectedMskPublic: Uint8Array

    private constructor(
        ourSpakeMessage: Uint8Array,
        ourConfirmation: Uint8Array,
        sessionKey: Uint8Array,
        verifyInitiator: (peer: Uint8Array) => boolean,
        expectedMskPublic: Uint8Array,
    ) {
        this.ourSpakeMessage = ourSpakeMessage
        this.ourConfirmation = ourConfirmation
        this.sessionKey = sessionKey
        this.verifyInitiator = verifyInitiator
        this.expectedMskPublic = expectedMskPublic
    }

    /**
     * Begin a pairing session on the new device after scanning a QR.
     * Caller passes the initiator's SPAKE2 message (received via the
     * caller's transport — the QR carries the static parameters, the
     * SPAKE2 message itself does not).
     */
    static fromQr(qrJson: string, initiatorSpakeMessage: Uint8Array): PairingResponder {
        const parsed = JSON.parse(qrJson) as Partial<QrPayload>
        if (parsed.v !== PROTOCOL_VERSION || !parsed.msk_public || !parsed.pair_token) {
            throw new Error("Pairing QR: malformed or unsupported protocol version")
        }
        const pairToken = b64ToBytes(parsed.pair_token)
        const expectedMskPublic = b64ToBytes(parsed.msk_public)

        const spake = Spake2.start(pairToken, "responder")
        const derived = spake.derive(initiatorSpakeMessage)

        return new PairingResponder(
            spake.ourMessage,
            derived.ourConfirmation,
            derived.sessionKey,
            (peer) => derived.verifyConfirmation(peer),
            expectedMskPublic,
        )
    }

    /**
     * After verifying the initiator's confirmation, decrypt the sealed
     * bundle and reconstruct an {@link IdentityKeypair} ready to write
     * to local storage.
     *
     * Throws on confirmation mismatch, ciphertext tamper, or
     * msk_public divergence from the QR — any of those means the
     * pairing was MITM'd or tampered with.
     */
    finalize(initiatorConfirmation: Uint8Array, sealedBundle: Uint8Array): IdentityKeypair {
        if (!this.verifyInitiator(initiatorConfirmation)) {
            throw new Error(
                "Pairing aborted: initiator's SPAKE2 confirmation did not verify (wrong pair_token or MITM)",
            )
        }
        if (sealedBundle.length <= NONCE_BYTES) {
            throw new Error("Pairing sealed bundle too short")
        }
        const nonce = sealedBundle.slice(0, NONCE_BYTES)
        const ct = sealedBundle.slice(NONCE_BYTES)
        const cipher = xchacha20poly1305(this.sessionKey, nonce, BUNDLE_AAD)
        let plaintext: Uint8Array
        try {
            plaintext = cipher.decrypt(ct)
        } catch (e) {
            throw new Error("Pairing sealed bundle failed AEAD verification", { cause: e })
        }
        const json = JSON.parse(new TextDecoder().decode(plaintext)) as SealedBundleJson
        const keypair = fromJson(json)

        // Sanity-check that the MSK private we just decrypted is the
        // one the initiator advertised. ed25519 derives the public
        // deterministically; mismatch here means the bundle was
        // swapped under us by something that knew the session key,
        // which shouldn't be possible without the pair_token.
        const derived = ed25519.getPublicKey(keypair.msk_private)
        if (!constantTimeEquals(derived, this.expectedMskPublic) ||
            !constantTimeEquals(keypair.msk_public, this.expectedMskPublic)) {
            throw new Error("Pairing rejected: MSK public in bundle does not match QR")
        }
        return keypair
    }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function bytesToB64(bytes: Uint8Array): string {
    let s = ""
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s)
}

function b64ToBytes(s: string): Uint8Array {
    const bin = atob(s)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
}

function toJson(k: IdentityKeypair): SealedBundleJson {
    return {
        msk_public: bytesToB64(k.msk_public),
        msk_private: bytesToB64(k.msk_private),
        ssk_public: bytesToB64(k.ssk_public),
        ssk_private: bytesToB64(k.ssk_private),
        ssk_signature: bytesToB64(k.ssk_signature),
        usk_public: bytesToB64(k.usk_public),
        usk_private: bytesToB64(k.usk_private),
        usk_signature: bytesToB64(k.usk_signature),
    }
}

function fromJson(j: SealedBundleJson): IdentityKeypair {
    return {
        msk_public: b64ToBytes(j.msk_public),
        msk_private: b64ToBytes(j.msk_private),
        ssk_public: b64ToBytes(j.ssk_public),
        ssk_private: b64ToBytes(j.ssk_private),
        ssk_signature: b64ToBytes(j.ssk_signature),
        usk_public: b64ToBytes(j.usk_public),
        usk_private: b64ToBytes(j.usk_private),
        usk_signature: b64ToBytes(j.usk_signature),
    }
}

function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
    return diff === 0
}

// Compile-time guard on the wire shape — if any byte width drifts the
// pairing protocol's downstream code goes wrong silently. Enforce here.
const _SIZES_CHECK: [32, 32, 24, 32] = [
    SPAKE2_MESSAGE_BYTES,
    CONFIRMATION_BYTES,
    NONCE_BYTES,
    PAIR_TOKEN_BYTES,
]
void _SIZES_CHECK
