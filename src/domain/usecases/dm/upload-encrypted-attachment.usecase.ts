import type { Attachment } from "@/domain/models/dm"
import type { AttachmentBlobKey } from "@/domain/models/e2ee"
import type { IAttachmentCryptoPort } from "@/domain/ports/attachment-crypto.port"
import type { IDmPort, UploadProgress } from "@/domain/ports/dm.port"

export interface UploadEncryptedAttachmentParams {
    idpUrl: string
    accessToken: string
    file: File
    onProgress?: UploadProgress
    signal?: AbortSignal
}

/**
 * Encrypt-before-upload pipeline (Phase 5c.4 / `specs/05-e2ee.md § 7`):
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

    // Server stores placeholder filename + MIME — the real values
    // travel inside the encrypted body. The encrypted File's name is
    // the literal "encrypted" so the attachment row's
    // `original_filename` is set to that.
    const encryptedFile = new File([ciphertext as BlobPart], "encrypted", {
        type: "application/octet-stream",
    })

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
