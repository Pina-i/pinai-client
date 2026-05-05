import type { IUserPort } from "@/domain/ports/user.port"

export interface UploadAvatarParams {
    idpUrl: string
    accessToken: string
    blob: Blob
    contentType: string
    setAvatarUrl: (url: string | null) => void
}

export async function uploadAvatarUseCase(
    userPort: IUserPort,
    params: UploadAvatarParams,
): Promise<string> {
    const { avatar_url } = await userPort.uploadAvatar(
        params.idpUrl,
        params.accessToken,
        params.blob,
        params.contentType,
    )
    params.setAvatarUrl(avatar_url)
    return avatar_url
}
