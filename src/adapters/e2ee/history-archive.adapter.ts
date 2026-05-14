/**
 * Phase 7 — Layer B history-backup encryption primitive.
 *
 * Pure crypto adapter. No I/O — see `history-archive-api.adapter.ts` for
 * the REST surface, and `e2ee.adapter.ts` for the buffered flush loop that
 * wires the two together.
 *
 * Each device of the same user derives the same History Archive Key from
 * `Argon2id(passphrase, salt)` and uses it for AES-256-GCM encryption of
 * every decrypted plaintext, with a fresh 12-byte nonce per entry. The
 * server only ever sees `(ciphertext, nonce)` blobs.
 */

import { gcm } from "@noble/ciphers/aes.js"
import { argon2idAsync } from "@noble/hashes/argon2.js"

/** Argon2id parameters — match the recovery adapter's defaults for consistency. */
const ARGON2_PARAMS = { t: 3, m: 64 * 1024, p: 4, dkLen: 32 }
const NONCE_BYTES = 12

export interface EncryptedEntry {
    ciphertext: Uint8Array
    nonce: Uint8Array
}

export class HistoryArchiveAdapter {
    /** Derive HAK = Argon2id(passphrase, salt) — deterministic. */
    async deriveKey(passphraseWords: string[], salt: Uint8Array): Promise<Uint8Array> {
        const passphrase = passphraseWords.join(" ")
        return argon2idAsync(passphrase, salt, ARGON2_PARAMS)
    }

    /** AES-256-GCM encrypt with a fresh 12-byte nonce. */
    async encrypt(key: Uint8Array, plaintext: Uint8Array): Promise<EncryptedEntry> {
        const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
        const ciphertext = gcm(key, nonce).encrypt(plaintext)
        return { ciphertext, nonce }
    }

    /** AES-256-GCM decrypt — throws on auth-tag mismatch. */
    async decrypt(key: Uint8Array, ciphertext: Uint8Array, nonce: Uint8Array): Promise<Uint8Array> {
        return gcm(key, nonce).decrypt(ciphertext)
    }
}
