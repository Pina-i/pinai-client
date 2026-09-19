import type { AttachmentBlobKey } from "@/domain/models/e2ee"

/**
 * Per-attachment AES-256-GCM sealing (`specs/05-e2ee.md § 7`).
 *
 * A port rather than a direct import because the implementation is
 * platform crypto: WebCrypto in the browser, a native provider on React
 * Native. The bytes it produces are protocol-visible — the key, nonce and
 * AAD travel to the peer inside the MLS application body — so every
 * implementation must agree byte-for-byte.
 */
export interface IAttachmentCryptoPort {
    /**
     * Seal a file for upload. Returns the ciphertext to POST and the
     * {@link AttachmentBlobKey} bundle that goes inside the MLS body.
     */
    encryptForUpload(file: File): Promise<{ ciphertext: Uint8Array; key: AttachmentBlobKey }>

    /**
     * Open the bytes the IdP returned for an attachment id.
     * Throws on tag mismatch — wrong key, tampered ciphertext, or a
     * server serving someone else's row under this id.
     */
    decryptDownloaded(ciphertext: Uint8Array, blobKey: AttachmentBlobKey): Promise<Blob>
}
