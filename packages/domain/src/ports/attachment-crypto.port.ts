import type { AttachmentBlobKey } from "../models/e2ee"
import type { LocalFile } from "../models/file"

/**
 * Per-attachment AES-256-GCM sealing (`identity-provider/specs/e2ee.md § 7`).
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
    encryptForUpload(file: LocalFile): Promise<{ ciphertext: Uint8Array; key: AttachmentBlobKey }>

    /**
     * Open the bytes the IdP returned for an attachment id.
     * Throws on tag mismatch — wrong key, tampered ciphertext, or a
     * server serving someone else's row under this id.
     *
     * Returns bytes, not a `Blob`: what the caller does with them is a
     * platform question (an object URL on the web, a cache file on a
     * device), and `blobKey.mime_type` carries the type either way.
     */
    decryptDownloaded(ciphertext: Uint8Array, blobKey: AttachmentBlobKey): Promise<Uint8Array>
}
