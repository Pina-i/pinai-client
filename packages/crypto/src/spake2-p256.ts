/**
 * SPAKE2 as RFC 9382 specifies it, suite SPAKE2-P256-SHA256-HKDF-HMAC: the group P-256 (cofactor
 * 1), points as uncompressed SEC1, SHA-256, HKDF-SHA256, HMAC-SHA256. A goes first and uses M; B
 * uses N. Pure — the caller brings w and the secret scalar; Appendix B's vectors pin it
 * (`apps/web/test/spake2-p256.spec.ts`).
 */

import { p256 } from "@noble/curves/nist.js"
import { bytesToNumberBE, concatBytes, equalBytes, numberToBytesBE } from "@noble/curves/utils.js"
import { hkdf } from "@noble/hashes/hkdf.js"
import { hmac } from "@noble/hashes/hmac.js"
import { sha256 } from "@noble/hashes/sha2.js"

const Point = p256.Point
type P256Point = InstanceType<typeof Point>

/** p, the order of P-256's group. */
export const SPAKE2_ORDER = Point.Fn.ORDER
const SCALAR_BYTES = 32
/** An uncompressed SEC1 point: `0x04 || X || Y`. */
export const SPAKE2_SHARE_BYTES = 65

/** RFC 9382 § 6, for P-256, as Appendix A generates them from their seeds. */
export const SPAKE2_M = Point.fromHex("02886e2f97ace46e55ba9dd7242579f2993b64e16ef3dcab95afd497333d8fa12f")
export const SPAKE2_N = Point.fromHex("03d8bbd6c639c62937b04d997f38c3770719c629d7014d49a24b4f98baa1292b49")

export type Spake2Role = "A" | "B"

/** w = OS2IP(MHF output) mod p: an output 64 bits longer than p keeps the reduction unbiased. */
export function passwordScalar(mhfOutput: Uint8Array): bigint {
    return bytesToNumberBE(mhfOutput) % SPAKE2_ORDER
}

/** Uniform in [1, p), by rejection sampling. */
export function randomScalar(): bigint {
    for (;;) {
        const candidate = bytesToNumberBE(crypto.getRandomValues(new Uint8Array(SCALAR_BYTES)))
        if (candidate > 0n && candidate < SPAKE2_ORDER) return candidate
    }
}

/** pA = w·M + x·P, or pB = w·N + y·P. */
export function spake2Share(role: Spake2Role, w: bigint, scalar: bigint): Uint8Array {
    const blind = (role === "A" ? SPAKE2_M : SPAKE2_N).multiply(w)
    return Point.BASE.multiply(scalar).add(blind).toBytes(false)
}

/** A peer's share as received: uncompressed, on the curve, not the identity — else it throws. */
export function decodeShare(bytes: Uint8Array): P256Point {
    if (bytes.length !== SPAKE2_SHARE_BYTES || bytes[0] !== 0x04) throw new Error("Not an uncompressed P-256 point")
    const point = Point.fromBytes(bytes)
    point.assertValidity()
    return point
}

export interface Spake2Secrets {
    /** K, encoded. */
    k: Uint8Array
    transcript: Uint8Array
    /** The shared secret the protocol outputs. */
    ke: Uint8Array
    ka: Uint8Array
    kcA: Uint8Array
    kcB: Uint8Array
    /** cA = MAC(KcA, TT), cB = MAC(KcB, TT). */
    confirmA: Uint8Array
    confirmB: Uint8Array
}

/**
 * Both sides' secrets once the peer's share came: K = h·x·(pB − w·N) for A, h·y·(pA − w·M) for B
 * (h = 1), the transcript TT, then § 4's key schedule with `aad`.
 */
export function spake2Finish(input: {
    role: Spake2Role
    w: bigint
    scalar: bigint
    ownShare: Uint8Array
    peerShare: Uint8Array
    idA: Uint8Array
    idB: Uint8Array
    aad: Uint8Array
}): Spake2Secrets {
    const { role, w } = input
    const peer = decodeShare(input.peerShare)
    const unblind = (role === "A" ? SPAKE2_N : SPAKE2_M).multiply(w)
    const shared = peer.subtract(unblind).multiply(input.scalar)
    if (shared.is0()) throw new Error("SPAKE2 gave the identity")
    const k = shared.toBytes(false)
    const [pA, pB] = role === "A" ? [input.ownShare, input.peerShare] : [input.peerShare, input.ownShare]
    const transcript = spake2Transcript(input.idA, input.idB, pA, pB, k, w)
    return { k, transcript, ...keySchedule(transcript, input.aad) }
}

/** TT = len(A) || A || len(B) || B || len(pA) || pA || len(pB) || pB || len(K) || K || len(w) || w. */
export function spake2Transcript(
    idA: Uint8Array,
    idB: Uint8Array,
    pA: Uint8Array,
    pB: Uint8Array,
    k: Uint8Array,
    w: bigint,
): Uint8Array {
    const field = (bytes: Uint8Array) => concatBytes(lengthOf(bytes), bytes)
    return concatBytes(field(idA), field(idB), field(pA), field(pB), field(k), field(numberToBytesBE(w, SCALAR_BYTES)))
}

/** Hash(TT) = Ke || Ka; KcA || KcB = HKDF(Ka, nil, "ConfirmationKeys" || AAD, 32); cA, cB the MACs over TT. */
export function keySchedule(
    transcript: Uint8Array,
    aad: Uint8Array,
): { ke: Uint8Array; ka: Uint8Array; kcA: Uint8Array; kcB: Uint8Array; confirmA: Uint8Array; confirmB: Uint8Array } {
    const digest = sha256(transcript)
    const ke = digest.slice(0, 16)
    const ka = digest.slice(16)
    const kc = hkdf(sha256, ka, new Uint8Array(0), concatBytes(CONFIRMATION_KEYS, aad), 32)
    const kcA = kc.slice(0, 16)
    const kcB = kc.slice(16)
    return { ke, ka, kcA, kcB, confirmA: hmac(sha256, kcA, transcript), confirmB: hmac(sha256, kcB, transcript) }
}

/** Constant time over the bytes. */
export function sameConfirmation(received: Uint8Array, expected: Uint8Array): boolean {
    return equalBytes(received, expected)
}

const CONFIRMATION_KEYS = new TextEncoder().encode("ConfirmationKeys")

/** len(S): its length as an eight-byte little-endian number. */
function lengthOf(bytes: Uint8Array): Uint8Array {
    const out = new Uint8Array(8)
    new DataView(out.buffer).setBigUint64(0, BigInt(bytes.length), true)
    return out
}
