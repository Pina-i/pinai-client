/**
 * MSK / SSK / USK identity-key generation, signing, fingerprinting.
 *
 * The four user-controlled keys live ENTIRELY on the user's devices.
 * The IdP key directory only ever sees:
 * - `msk_public` (root of the user's chain)
 * - `ssk_public` + `ssk_signature` (SSK signed by MSK)
 * - `usk_public` + `usk_signature` (USK signed by MSK)
 *
 * Per-device leaf keys come from openmls — see `mls.adapter.ts`. Those
 * are signed by the SSK so receivers verify a leaf via
 * `leaf_sig → SSK_sig → MSK`.
 *
 * See `specs/05-e2ee.md § 2` for the trust model rationale.
 */

import { ed25519 } from "@noble/curves/ed25519.js"
import { sha512 } from "@noble/hashes/sha2.js"

import type {
    Fingerprint,
    IdentityKeypair,
    IdentityPublicKeys,
} from "@/domain/models/e2ee"

/**
 * RFC 4648 base32 alphabet, no padding. Used for the human-readable
 * fingerprint — case-insensitive, no easily-confused characters
 * after upper-casing.
 */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

/**
 * Length of the rendered fingerprint, in characters. 60 chars × 5 bits
 * = 300 bits of MSK-public hash, well above any feasible collision
 * search.
 */
const FINGERPRINT_CHARS = 60

/**
 * One operational identity for one user. The same triple is shared
 * across that user's paired devices; per-device differentiation lives
 * in the MLS leaf node, not here.
 */
export interface IdentityAdapter {
    /** Generate a fresh MSK/SSK/USK triple — one-time per user. */
    generate(): IdentityKeypair
    /**
     * Reconstruct a full keypair from a recovered MSK private. The
     * MSK public is derived; SSK and USK are freshly generated and
     * signed by MSK so the chain stays valid. Used by the Recovery
     * Key flow on a new device.
     */
    recoverFromMsk(mskPrivate: Uint8Array): IdentityKeypair
    /** Public-only projection for upload to `POST /api/keys/identity`. */
    publicKeys(keypair: IdentityKeypair): IdentityPublicKeys
    /**
     * Compute the 60-char base32 fingerprint of an MSK public key for
     * out-of-band verification. Stable across device reboots.
     */
    fingerprint(mskPublic: Uint8Array): Fingerprint
    /** SSK signs an arbitrary blob — used to certify MLS leaf-credentials. */
    signWithSsk(keypair: IdentityKeypair, message: Uint8Array): Uint8Array
    /** USK signs another user's MSK after out-of-band verification. */
    signWithUsk(keypair: IdentityKeypair, peerMskPublic: Uint8Array): Uint8Array
    /** Validate a remote `IdentityPublicKeys` blob. */
    validatePublicKeys(keys: IdentityPublicKeys): boolean
}

export class NobleIdentityAdapter implements IdentityAdapter {
    generate(): IdentityKeypair {
        return this.assembleFrom(ed25519.keygen())
    }

    recoverFromMsk(mskPrivate: Uint8Array): IdentityKeypair {
        // Ed25519 derives the public key deterministically from the
        // 32-byte secret; same MSK private → same MSK public →
        // same fingerprint. SSK + USK are fresh per recovery (spec § 9).
        const mskPublic = ed25519.getPublicKey(mskPrivate)
        return this.assembleFrom({ secretKey: mskPrivate, publicKey: mskPublic })
    }

    private assembleFrom(msk: { secretKey: Uint8Array; publicKey: Uint8Array }): IdentityKeypair {
        const ssk = ed25519.keygen()
        const usk = ed25519.keygen()

        // MSK signs SSK and USK so peers can chain a leaf back to the
        // root identity without trusting the IdP. Domain-tagged so an
        // SSK signature can never be replayed as a USK signature.
        const ssk_signature = ed25519.sign(
            tag("pinai/identity/ssk-of-msk/v1", ssk.publicKey),
            msk.secretKey,
        )
        const usk_signature = ed25519.sign(
            tag("pinai/identity/usk-of-msk/v1", usk.publicKey),
            msk.secretKey,
        )

        return {
            msk_public: msk.publicKey,
            msk_private: msk.secretKey,
            ssk_public: ssk.publicKey,
            ssk_private: ssk.secretKey,
            ssk_signature,
            usk_public: usk.publicKey,
            usk_private: usk.secretKey,
            usk_signature,
        }
    }

    publicKeys(k: IdentityKeypair): IdentityPublicKeys {
        return {
            msk_public: k.msk_public,
            ssk_public: k.ssk_public,
            ssk_signature: k.ssk_signature,
            usk_public: k.usk_public,
            usk_signature: k.usk_signature,
        }
    }

    fingerprint(mskPublic: Uint8Array): Fingerprint {
        // SHA-512 → 64 bytes → 103 base32 chars; slice to 60 for the
        // human-readable form. SHA-256's 52-char encoding falls short
        // of the spec's 60-char target. Either output has way more
        // entropy than humans can compare anyway — the cap is UX, not
        // crypto.
        const digest = sha512(mskPublic)
        return base32EncodeNoPad(digest).slice(0, FINGERPRINT_CHARS)
    }

    signWithSsk(k: IdentityKeypair, message: Uint8Array): Uint8Array {
        return ed25519.sign(message, k.ssk_private)
    }

    signWithUsk(k: IdentityKeypair, peerMskPublic: Uint8Array): Uint8Array {
        return ed25519.sign(
            tag("pinai/identity/usk-attests-msk/v1", peerMskPublic),
            k.usk_private,
        )
    }

    validatePublicKeys(keys: IdentityPublicKeys): boolean {
        try {
            const sskOk = ed25519.verify(
                keys.ssk_signature,
                tag("pinai/identity/ssk-of-msk/v1", keys.ssk_public),
                keys.msk_public,
            )
            const uskOk = ed25519.verify(
                keys.usk_signature,
                tag("pinai/identity/usk-of-msk/v1", keys.usk_public),
                keys.msk_public,
            )
            return sskOk && uskOk
        } catch {
            return false
        }
    }
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Concatenate a domain-separation tag with the message bytes. The tag
 * stops a USK signature from ever validating as an SSK signature even
 * if both keys were the same (they aren't, but defense-in-depth).
 */
function tag(label: string, message: Uint8Array): Uint8Array {
    const encoder = new TextEncoder()
    const tagBytes = encoder.encode(label + ":")
    const out = new Uint8Array(tagBytes.length + message.length)
    out.set(tagBytes, 0)
    out.set(message, tagBytes.length)
    return out
}

/**
 * RFC 4648 base32 encoder, padding stripped. Implemented inline rather
 * than pulled in as a dep — input here is always 32 bytes (a sha256
 * digest), so the loop is trivial and bench-irrelevant.
 */
function base32EncodeNoPad(bytes: Uint8Array): string {
    let bits = 0
    let value = 0
    let out = ""
    for (let i = 0; i < bytes.length; i++) {
        value = (value << 8) | bytes[i]
        bits += 8
        while (bits >= 5) {
            out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f]
            bits -= 5
        }
    }
    if (bits > 0) {
        out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f]
    }
    return out
}
