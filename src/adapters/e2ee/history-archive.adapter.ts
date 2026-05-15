/**
 * History-archive crypto. Pure — no I/O. HAK = Argon2id(passphrase, salt),
 * AES-256-GCM per entry with a fresh 12-byte nonce.
 */

import { gcm } from "@noble/ciphers/aes.js"
import { argon2idAsync } from "@noble/hashes/argon2.js"

const ARGON2_PARAMS = { t: 3, m: 64 * 1024, p: 4, dkLen: 32 }
const NONCE_BYTES = 12

export interface EncryptedEntry {
    ciphertext: Uint8Array
    nonce: Uint8Array
}

export class HistoryArchiveAdapter {
    async deriveKey(passphraseWords: string[], salt: Uint8Array): Promise<Uint8Array> {
        const passphrase = passphraseWords.join(" ")
        return argon2idAsync(passphrase, salt, ARGON2_PARAMS)
    }

    async encrypt(key: Uint8Array, plaintext: Uint8Array): Promise<EncryptedEntry> {
        const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
        const ciphertext = gcm(key, nonce).encrypt(plaintext)
        return { ciphertext, nonce }
    }

    /** Throws on auth-tag mismatch. */
    async decrypt(key: Uint8Array, ciphertext: Uint8Array, nonce: Uint8Array): Promise<Uint8Array> {
        return gcm(key, nonce).decrypt(ciphertext)
    }
}
