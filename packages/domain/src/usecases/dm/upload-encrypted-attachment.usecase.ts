import type { Attachment } from "../../models/dm"
import type { LocalFile } from "../../models/file"
import type { AttachmentBlobKey } from "../../models/e2ee"
import type { IAttachmentCryptoPort } from "../../ports/attachment-crypto.port"
import type { IDmPort, UploadProgress } from "../../ports/dm.port"

export interface UploadEncryptedAttachmentParams {
    idpUrl: string
    accessToken: string
    file: LocalFile
    onProgress?: UploadProgress
    signal?: AbortSignal
}

/**
 * Encrypt-before-upload pipeline (Phase 5c.4 / `identity-provider/specs/e2ee.md § 7`):
 * 1. Generate a fresh AES-256-GCM key + 12-byte nonce + UUID for
 *    this attachment.
 * 2. Encrypt the file bytes with AAD = the UUID.
 * 3. Upload the ciphertext to `POST /api/attachments` under that
 *    UUID, with placeholder `original_filename: "encrypted"` and
 *    `mime_type: "application/octet-stream"` so the server never
 *    sees the real metadata.
 * 4. Return the IdP's `Attachment` row (placeholder values) plus the
 *    `AttachmentBlobKey` bundle the sender will tuck into the MLS
 *    application body.
 */
export async function uploadEncryptedAttachmentUseCase(
    dmPort: IDmPort,
    attachmentCrypto: IAttachmentCryptoPort,
    params: UploadEncryptedAttachmentParams,
): Promise<{ attachment: Attachment; key: AttachmentBlobKey }> {
    const { ciphertext, key } = await attachmentCrypto.encryptForUpload(params.file)

    // Server stores placeholder filename + MIME — the real values travel
    // inside the encrypted body. The literal name "encrypted" is what the
    // attachment row's `original_filename` ends up as.
    const encryptedFile: LocalFile = {
        name: "encrypted",
        mimeType: "application/octet-stream",
        bytes: ciphertext,
    }

    const attachment = await dmPort.uploadAttachment(
        params.idpUrl,
        params.accessToken,
        encryptedFile,
        params.onProgress,
        params.signal,
        key.id,
    )

    return { attachment, key }
}
