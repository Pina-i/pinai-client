/**
 * Per-attachment AES-256-GCM encryption (`specs/05-e2ee.md § 7`).
 *
 * Each attachment gets a fresh 32-byte AES key + 12-byte nonce. The
 * AAD is the attachment's UUID — bound at upload time so the
 * receiving IdP can't swap one ciphertext for another's. The key +
 * nonce + UUID + plaintext metadata travel inside the encrypted MLS
 * application body (`TextBody.attachments[]`); the server only ever
 * sees ciphertext bytes + a placeholder filename / MIME.
 */

import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import type { LocalFile } from "@pinai/domain/models/file"
import type { IAttachmentCryptoPort } from "@pinai/domain/ports/attachment-crypto.port"

const AES_ALGORITHM: AesKeyAlgorithm = { name: "AES-GCM", length: 256 }
const KEY_USAGES: KeyUsage[] = ["encrypt", "decrypt"]
const NONCE_BYTES = 12

/**
 * Encrypt-before-upload. Returns:
 * - `attachment_id`: client-generated UUID. Becomes the row's `id`
 *   on the server (Phase 5c.4 backend tweak: `POST /api/attachments`
 *   accepts an `attachment_id` form field).
 * - `ciphertext`: encrypted bytes for upload.
 * - `key`: the {id, key, nonce, original_filename, mime_type, byte_size}
 *   bundle that travels inside the MLS body. The receiver uses it to
 *   decrypt.
 */
export async function encryptForUpload(file: LocalFile): Promise<{
    ciphertext: Uint8Array
    key: AttachmentBlobKey
}> {
    const id = crypto.randomUUID()
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
    const cryptoKey = await crypto.subtle.generateKey(
        AES_ALGORITHM,
        /* extractable */ true,
        KEY_USAGES,
    )

    const plaintext = file.bytes
    const aad = new TextEncoder().encode(id)
    const ciphertextAb = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce, additionalData: aad as BufferSource },
        cryptoKey,
        plaintext as BufferSource,
    )
    const rawKeyAb = await crypto.subtle.exportKey("raw", cryptoKey)

    return {
        ciphertext: new Uint8Array(ciphertextAb),
        key: {
            id,
            key: new Uint8Array(rawKeyAb),
            nonce,
            original_filename: file.name,
            mime_type: file.mimeType || "application/octet-stream",
            byte_size: file.bytes.length,
        },
    }
}

/**
 * Decrypt the bytes returned by the IdP for an attachment id, using
 * the per-attachment key + nonce extracted from the MLS body.
 *
 * Throws on tag-mismatch (wrong key, tampered ciphertext, or AAD
 * mismatch — meaning the server is serving someone else's row under
 * this id).
 */
export async function decryptDownloaded(
    ciphertext: Uint8Array,
    blobKey: AttachmentBlobKey,
): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        blobKey.key as BufferSource,
        AES_ALGORITHM,
        /* extractable */ false,
        KEY_USAGES,
    )
    const aad = new TextEncoder().encode(blobKey.id)
    const plaintextAb = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: blobKey.nonce as BufferSource, additionalData: aad as BufferSource },
        cryptoKey,
        ciphertext as BufferSource,
    )
    return new Uint8Array(plaintextAb)
}

/**
 * WebCrypto implementation of {@link IAttachmentCryptoPort}.
 *
 * The free functions above stay exported: the E2EE integration specs
 * drive them directly, and there is no value in going through an
 * instance there.
 */
export class WebCryptoAttachmentCryptoAdapter implements IAttachmentCryptoPort {
    encryptForUpload(file: LocalFile): Promise<{ ciphertext: Uint8Array; key: AttachmentBlobKey }> {
        return encryptForUpload(file)
    }

    decryptDownloaded(ciphertext: Uint8Array, blobKey: AttachmentBlobKey): Promise<Uint8Array> {
        return decryptDownloaded(ciphertext, blobKey)
    }
}
