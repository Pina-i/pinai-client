/**
 * SPAKE2 over Ristretto255 (RFC 9382 § 3, generalised group form).
 *
 * Used by the device-pairing flow: existing device displays a QR
 * containing a high-entropy 32-byte `pair_token`; new device scans
 * it; both run SPAKE2 to derive a session key; the existing device
 * encrypts MSK/SSK private bytes under that key and ships them to
 * the new device.
 *
 * SPAKE2's whole point is "the protocol is safe even if the password
 * is low-entropy". Our `pair_token` is high entropy already, so we'd
 * survive plain authenticated ECDH — but SPAKE2 hardens the dance
 * cheaply and matches the implementation plan.
 *
 * ## The dance
 *
 * Setup (compile-time):
 *   G = Ristretto255 base point (prime order q)
 *   M = ristretto255_hasher.hashToCurve("pinai/spake2/M-v1")
 *   N = ristretto255_hasher.hashToCurve("pinai/spake2/N-v1")
 *
 * Per session, given password `pw`:
 *   w = H(pw) mod q
 *
 * Initiator (A):
 *   pick x ← Z_q random
 *   T = x·G + w·M               // outgoing message
 *
 * Responder (B):
 *   pick y ← Z_q random
 *   S = y·G + w·N               // outgoing message
 *
 * Both:
 *   K_A = x · (S − w·N)         // computed by initiator
 *   K_B = y · (T − w·M)         // computed by responder
 *   K_A == K_B == x·y·G
 *
 *   transcript = role_tag || T || S || K || w
 *   sessionKey  = SHA-512( "spake2/session" || transcript )[0..32]
 *   confirmInit = SHA-512( "spake2/conf-init"  || transcript )[0..32]
 *   confirmResp = SHA-512( "spake2/conf-resp"  || transcript )[0..32]
 *
 * Each side sends its *own* confirmation tag and verifies the other
 * side's. A MITM that doesn't know the password produces a different
 * `K`, so confirmation fails.
 */

import { ristretto255, ristretto255_hasher } from "@noble/curves/ed25519.js"
import { mod } from "@noble/curves/abstract/modular.js"
import { sha512 } from "@noble/hashes/sha2.js"

// Ristretto255's prime order — same as the Ed25519 prime-order
// subgroup. Hard-coded because @noble doesn't surface it as a top-level
// constant on the Ristretto export.
const RISTRETTO_ORDER =
    7237005577332262213973186563042994240857116359379907606001950938285454250989n

const G = ristretto255.Point.BASE

// Independent generators — discrete log relative to G is unknown. Same
// inputs every run so two independently-built clients pair correctly.
const M = ristretto255_hasher.hashToCurve(new TextEncoder().encode("pinai/spake2/M-v1"))
const N = ristretto255_hasher.hashToCurve(new TextEncoder().encode("pinai/spake2/N-v1"))

const SCALAR_BYTES = 32
const POINT_BYTES = 32
const SESSION_KEY_BYTES = 32
const CONFIRMATION_BYTES = 32

export type Spake2Role = "initiator" | "responder"

/**
 * Result of {@link Spake2.start} — owns the in-progress state and
 * exposes the outgoing message + a finaliser.
 */
export interface Spake2InProgress {
    /** Send this byte string to the peer (32 bytes — the role's `T` or `S`). */
    readonly ourMessage: Uint8Array
    /**
     * Combine the peer's outgoing message into a session key + this
     * side's confirmation tag + a verifier for the peer's tag.
     *
     * Throws if `peerMessage` is malformed (not a valid Ristretto255
     * point). Wrong-password is *not* detected here — both sides
     * derive a (different) session key without error; the confirmation
     * tag exchange is what catches it.
     */
    derive(peerMessage: Uint8Array): Spake2Derived
}

export interface Spake2Derived {
    /** 32 bytes — symmetric key for the AEAD wrap of MSK/SSK private. */
    readonly sessionKey: Uint8Array
    /** Send to the peer; they'll call {@link Spake2Derived.verifyConfirmation} on it. */
    readonly ourConfirmation: Uint8Array
    /**
     * Constant-time equality check against the peer's confirmation
     * tag. False return == "wrong password or MITM" — caller MUST
     * abort the protocol and not use `sessionKey`.
     */
    verifyConfirmation(peerConfirmation: Uint8Array): boolean
}

export const Spake2 = {
    /**
     * Begin a SPAKE2 handshake. The caller passes the shared
     * `password` (the QR `pair_token` for our pairing flow) and the
     * role this side plays in the protocol.
     *
     * `randomScalarOverride` is for testing only — do not pass it in
     * production code.
     */
    start(password: Uint8Array, role: Spake2Role, randomScalarOverride?: bigint): Spake2InProgress {
        const w = hashToScalar(password)
        const x = randomScalarOverride ?? randomScalar()

        // T = x·G + w·M (initiator) or  S = x·G + w·N (responder)
        const blind = role === "initiator" ? M.multiply(w) : N.multiply(w)
        const ourPoint = G.multiply(x).add(blind)
        const ourMessage = ourPoint.toBytes()

        return {
            ourMessage,
            derive(peerMessage: Uint8Array): Spake2Derived {
                if (peerMessage.length !== POINT_BYTES) {
                    throw new Error(
                        `SPAKE2 peer message must be ${POINT_BYTES} bytes, got ${peerMessage.length}`,
                    )
                }
                const peerPoint = ristretto255.Point.fromBytes(peerMessage)

                // Strip the peer's password-blind to recover y·G (initiator
                // case) or x·G (responder case), then multiply by our own
                // scalar to obtain the shared K = x·y·G.
                const peerBlind = role === "initiator" ? N.multiply(w) : M.multiply(w)
                const sharedK = peerPoint.subtract(peerBlind).multiply(x)
                const kBytes = sharedK.toBytes()

                // The transcript orders messages canonically: initiator's
                // message first, then responder's. This way both sides
                // hash identical bytes regardless of who computes
                // `derive` first.
                const initiatorMsg = role === "initiator" ? ourMessage : peerMessage
                const responderMsg = role === "initiator" ? peerMessage : ourMessage

                const transcript = concatBytes(
                    encodeLength(initiatorMsg.length),
                    initiatorMsg,
                    encodeLength(responderMsg.length),
                    responderMsg,
                    encodeLength(kBytes.length),
                    kBytes,
                    encodeLength(SCALAR_BYTES),
                    scalarToBytes(w),
                )

                const sessionKey = sha512(
                    concatBytes(new TextEncoder().encode("pinai/spake2/session-v1:"), transcript),
                ).slice(0, SESSION_KEY_BYTES)

                const ourTag = role === "initiator" ? "pinai/spake2/conf-init-v1:" : "pinai/spake2/conf-resp-v1:"
                const theirTag = role === "initiator" ? "pinai/spake2/conf-resp-v1:" : "pinai/spake2/conf-init-v1:"
                const ourConfirmation = sha512(
                    concatBytes(new TextEncoder().encode(ourTag), transcript, sessionKey),
                ).slice(0, CONFIRMATION_BYTES)
                const expectedPeer = sha512(
                    concatBytes(new TextEncoder().encode(theirTag), transcript, sessionKey),
                ).slice(0, CONFIRMATION_BYTES)

                return {
                    sessionKey,
                    ourConfirmation,
                    verifyConfirmation(peerConfirmation: Uint8Array): boolean {
                        return constantTimeEquals(peerConfirmation, expectedPeer)
                    },
                }
            },
        }
    },
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** SHA-512 the password and reduce mod q to get a uniform scalar in [0, q-1]. */
function hashToScalar(input: Uint8Array): bigint {
    const wide = sha512(input) // 64 bytes — wide enough that mod q is uniform
    const acc = bytesToBigIntLE(wide)
    return mod(acc, RISTRETTO_ORDER)
}

/** Cryptographically secure random scalar in [1, q-1]. */
function randomScalar(): bigint {
    // Loop guards against the (vanishingly unlikely) draw of 0; rejecting
    // 0 keeps `x·G` from collapsing to the identity.
    for (;;) {
        const bytes = crypto.getRandomValues(new Uint8Array(64))
        const candidate = mod(bytesToBigIntLE(bytes), RISTRETTO_ORDER)
        if (candidate !== 0n) return candidate
    }
}

function scalarToBytes(s: bigint): Uint8Array {
    const out = new Uint8Array(SCALAR_BYTES)
    let v = s
    for (let i = 0; i < SCALAR_BYTES; i++) {
        out[i] = Number(v & 0xffn)
        v >>= 8n
    }
    return out
}

function bytesToBigIntLE(bytes: Uint8Array): bigint {
    let v = 0n
    for (let i = bytes.length - 1; i >= 0; i--) {
        v = (v << 8n) | BigInt(bytes[i])
    }
    return v
}

function encodeLength(n: number): Uint8Array {
    const out = new Uint8Array(4)
    new DataView(out.buffer).setUint32(0, n, /* littleEndian */ true)
    return out
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    let total = 0
    for (const a of arrays) total += a.length
    const out = new Uint8Array(total)
    let offset = 0
    for (const a of arrays) {
        out.set(a, offset)
        offset += a.length
    }
    return out
}

function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
    return diff === 0
}
