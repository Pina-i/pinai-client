/**
 * Argon2id-derived KEK + XChaCha20-Poly1305 wrap/unwrap of the user's
 * MSK private key. Matches `identity-provider/specs/e2ee.md § 9`.
 *
 * Wire format
 * - `wrapped_msk` is `nonce(24) || ciphertext_with_tag` — the server
 *   stores it as one opaque blob (no separate nonce column).
 * - `salt` is a fresh 32-byte random value per wrap.
 * - `argon2_params` carries `{ m_kib, t, p }` so we can rotate the
 *   recommended difficulty without breaking old blobs.
 *
 * All KDF + symmetric crypto stays in this adapter so the rest of the
 * code never touches a passphrase or a wrapped blob.
 */

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js"
import { argon2idAsync } from "@noble/hashes/argon2.js"

import type { Argon2Params } from "@pinai/domain/ports/key-directory.port"

/**
 * AAD for the wrap. Domain-tagged so a wrapped MSK blob can never be
 * mistaken for some future "wrapped X" payload of the same shape.
 * Versioned for future rotations of the wrap construction.
 */
const RECOVERY_AAD = new TextEncoder().encode("pinai/recovery-msk/v1")

/**
 * 32 bytes — same length as the MSK private — random per wrap so the
 * Argon2id KEK is never reused across users. Server validates ≥ 16.
 */
const SALT_BYTES = 32

/** XChaCha20-Poly1305 nonce length. Always 24 bytes. */
const NONCE_BYTES = 24

/** KEK length — XChaCha20-Poly1305 uses 32-byte keys. */
const KEK_BYTES = 32

/**
 * Recommended Argon2id parameters from spec § 9. Operators can rotate
 * by bumping `t` or `m_kib`; old blobs keep working because the
 * params travel with each blob.
 */
export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
    m_kib: 64 * 1024,
    t: 3,
    p: 4,
}

/**
 * Recovery Key wrap output — exactly what `PUT /api/keys/recovery`
 * accepts on the wire (modulo base64).
 */
export interface RecoveryBlob {
    wrapped_msk: Uint8Array
    salt: Uint8Array
    argon2_params: Argon2Params
}

export interface RecoveryAdapter {
    /** Wrap an MSK private key under a user passphrase. */
    wrap(mskPrivate: Uint8Array, passphrase: string, params?: Argon2Params): Promise<RecoveryBlob>
    /** Unwrap a stored blob; throws on wrong passphrase or tampered ciphertext. */
    unwrap(blob: RecoveryBlob, passphrase: string): Promise<Uint8Array>
}

export class NobleRecoveryAdapter implements RecoveryAdapter {
    async wrap(
        mskPrivate: Uint8Array,
        passphrase: string,
        params: Argon2Params = DEFAULT_ARGON2_PARAMS,
    ): Promise<RecoveryBlob> {
        validateParams(params)

        const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
        const kek = await deriveKek(passphrase, salt, params)
        const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))

        // `xchacha20poly1305(key, nonce, aad).encrypt(pt)` returns
        // `ciphertext || 16-byte tag`. Prepend the nonce so the wire
        // blob is self-contained.
        const cipher = xchacha20poly1305(kek, nonce, RECOVERY_AAD)
        const ciphertextWithTag = cipher.encrypt(mskPrivate)

        const wrapped = new Uint8Array(NONCE_BYTES + ciphertextWithTag.length)
        wrapped.set(nonce, 0)
        wrapped.set(ciphertextWithTag, NONCE_BYTES)

        return { wrapped_msk: wrapped, salt, argon2_params: params }
    }

    async unwrap(blob: RecoveryBlob, passphrase: string): Promise<Uint8Array> {
        validateParams(blob.argon2_params)
        if (blob.wrapped_msk.length <= NONCE_BYTES) {
            throw new Error("Recovery blob too short — corrupt or wrong format")
        }
        const nonce = blob.wrapped_msk.slice(0, NONCE_BYTES)
        const ciphertextWithTag = blob.wrapped_msk.slice(NONCE_BYTES)

        const kek = await deriveKek(passphrase, blob.salt, blob.argon2_params)
        const cipher = xchacha20poly1305(kek, nonce, RECOVERY_AAD)
        try {
            return cipher.decrypt(ciphertextWithTag)
        } catch (e) {
            // `@noble/ciphers` throws on tag mismatch — surface as a
            // single user-facing error so the UI can render "wrong
            // passphrase" without leaking which step failed.
            throw new Error("Recovery passphrase did not unwrap the blob — wrong passphrase or corrupt data", { cause: e })
        }
    }
}

async function deriveKek(
    passphrase: string,
    salt: Uint8Array,
    params: Argon2Params,
): Promise<Uint8Array> {
    return argon2idAsync(passphrase, salt, {
        m: params.m_kib,
        t: params.t,
        p: params.p,
        dkLen: KEK_BYTES,
    })
}

function validateParams(p: Argon2Params): void {
    if (p.m_kib <= 0 || p.t <= 0 || p.p <= 0) {
        throw new Error("Argon2id params must all be positive")
    }
}
