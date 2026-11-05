/**
 * History-key crypto (`identity-provider/specs/e2ee.md § 3.7`, § 7.3). Pure — no I/O. The History
 * Archive Key is Argon2id(passphrase, the generation's salt); it gives the check value and the
 * approval key, and seals each archive entry with AES-256-GCM under a fresh 12-byte nonce, the
 * entry's ids as associated data.
 */

import { gcm } from "@noble/ciphers/aes.js"
import { ed25519 } from "@noble/curves/ed25519.js"
import { argon2idAsync } from "@noble/hashes/argon2.js"
import { hkdf } from "@noble/hashes/hkdf.js"
import { hmac } from "@noble/hashes/hmac.js"
import { sha256 } from "@noble/hashes/sha2.js"

import { editEntryId } from "@pinai/domain/models/history-archive"
import type { DerivedHistoryKey } from "@pinai/domain/models/history-key"

const ARGON2_PARAMS = { t: 3, m: 64 * 1024, p: 4, dkLen: 32 }
const NONCE_BYTES = 12
export const HISTORY_SALT_BYTES = 16

const encoder = new TextEncoder()
const CHECK_MESSAGE = encoder.encode("pinai/history-archive/check-v1")
const APPROVAL_INFO = encoder.encode("pinai/device-approval/v1")
const REARCHIVE_ID_INFO = encoder.encode("pinai/rearchive-entry-id/v1")

export interface EncryptedEntry {
    ciphertext: Uint8Array
    nonce: Uint8Array
}

function approvalSeed(hak: Uint8Array): Uint8Array {
    return hkdf(sha256, hak, undefined, APPROVAL_INFO, 32)
}

export class HistoryArchiveAdapter {
    /** The password of § 3.7: the words trimmed, lowercased, joined by single spaces, as UTF-8. */
    async deriveKey(passphraseWords: string[], salt: Uint8Array): Promise<Uint8Array> {
        const password = passphraseWords.map((word) => word.trim().toLowerCase()).join(" ")
        return argon2idAsync(encoder.encode(password), salt, ARGON2_PARAMS)
    }

    /** The values a generation stores beside its salt. */
    derive(hak: Uint8Array): DerivedHistoryKey {
        return {
            checkValue: hmac(sha256, hak, CHECK_MESSAGE),
            approvalPublicKey: ed25519.getPublicKey(approvalSeed(hak)),
        }
    }

    /** The generation's approval key over `bytes` — `PINAI-DEVICE-APPROVAL-v1`'s. */
    signApproval(hak: Uint8Array, bytes: Uint8Array): Uint8Array {
        return ed25519.sign(bytes, approvalSeed(hak))
    }

    /**
     * A re-archive's reaction snapshot id: a version-8 UUID of `HMAC-SHA256(HKDF-SHA256(HAK, info
     * "pinai/rearchive-entry-id/v1"), "<conversation>\n<message>\nreactions")`, the ids lowercased.
     * Only the words' holders compute it, and it is the same at every run under one key.
     */
    reactionSnapshotId(hak: Uint8Array, conversationId: string, messageId: string): string {
        const key = hkdf(sha256, hak, undefined, REARCHIVE_ID_INFO, 32)
        const message = encoder.encode(`${conversationId.toLowerCase()}\n${messageId.toLowerCase()}\nreactions`)
        return editEntryId(hmac(sha256, key, message))
    }

    async encrypt(key: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Promise<EncryptedEntry> {
        const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
        const ciphertext = gcm(key, nonce, aad).encrypt(plaintext)
        return { ciphertext, nonce }
    }

    /** Throws on auth-tag mismatch: another key, or other associated data. */
    async decrypt(key: Uint8Array, ciphertext: Uint8Array, nonce: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
        return gcm(key, nonce, aad).decrypt(ciphertext)
    }
}
