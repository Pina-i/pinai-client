import type { Attachment } from "@/domain/models/dm"
import type { LocalFile } from "@/domain/models/file"
import type { IDmPort, UploadProgress } from "@/domain/ports/dm.port"

export interface UploadAttachmentParams {
    idpUrl: string
    accessToken: string
    file: LocalFile
    onProgress?: UploadProgress
    signal?: AbortSignal
}

export function uploadAttachmentUseCase(
    dmPort: IDmPort,
    params: UploadAttachmentParams,
): Promise<Attachment> {
    return dmPort.uploadAttachment(
        params.idpUrl,
        params.accessToken,
        params.file,
        params.onProgress,
        params.signal,
    )
}
