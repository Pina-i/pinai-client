import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import type { LocalFile } from "@pinai/domain/models/file"
import type { IAttachmentCryptoPort } from "@pinai/domain/ports/attachment-crypto.port"

const KEY_BYTES = 32
const NONCE_BYTES = 12

/**
 * {@link IAttachmentCryptoPort} on the browser's own AES-256-GCM: the same bytes as
 * `@pinai/crypto`'s portable noble adapter, about twenty times faster and off the main
 * thread, so opening a conversation full of images no longer freezes the page.
 */
export class WebCryptoAttachmentCryptoAdapter implements IAttachmentCryptoPort {
    async encryptForUpload(file: LocalFile): Promise<{ ciphertext: Uint8Array; key: AttachmentBlobKey }> {
        const id = crypto.randomUUID()
        const key = crypto.getRandomValues(new Uint8Array(KEY_BYTES))
        const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
        const ciphertext = await crypto.subtle.encrypt(
            sealing(nonce, id),
            await importKey(key, "encrypt"),
            file.bytes as BufferSource,
        )
        return {
            ciphertext: new Uint8Array(ciphertext),
            key: {
                id,
                key,
                nonce,
                original_filename: file.name,
                mime_type: file.mimeType || "application/octet-stream",
                byte_size: file.bytes.length,
            },
        }
    }

    async decryptDownloaded(ciphertext: Uint8Array, blobKey: AttachmentBlobKey): Promise<Uint8Array> {
        const plaintext = await crypto.subtle.decrypt(
            sealing(blobKey.nonce, blobKey.id),
            await importKey(blobKey.key, "decrypt"),
            ciphertext as BufferSource,
        )
        return new Uint8Array(plaintext)
    }
}

function importKey(raw: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [usage])
}

// The attachment's id is the AAD, so the server can't serve one attachment's bytes under another's id.
function sealing(nonce: Uint8Array, id: string): AesGcmParams {
    return { name: "AES-GCM", iv: nonce as BufferSource, additionalData: new TextEncoder().encode(id) }
}
