import type { AttachmentBlobKey } from "../../models/e2ee"
import type { IAttachmentCryptoPort } from "../../ports/attachment-crypto.port"
import type { IDmPort } from "../../ports/dm.port"

/** An attachment's plaintext: its ciphertext from the IdP, opened with the key its message carried. */
export async function openAttachmentUseCase(
    session: { idpUrl: string; accessToken: string },
    key: AttachmentBlobKey,
    deps: { dm: IDmPort; attachmentCrypto: IAttachmentCryptoPort },
): Promise<Uint8Array> {
    const ciphertext = await deps.dm.downloadAttachment(session.idpUrl, session.accessToken, key.id)
    return deps.attachmentCrypto.decryptDownloaded(ciphertext, key)
}
