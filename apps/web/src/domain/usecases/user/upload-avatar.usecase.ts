import type { LocalFile } from "@/domain/models/file"
import type { IUserPort } from "@/domain/ports/user.port"

export interface UploadAvatarParams {
    idpUrl: string
    accessToken: string
    avatar: LocalFile
    setAvatarUrl: (url: string | null) => void
}

export async function uploadAvatarUseCase(
    userPort: IUserPort,
    params: UploadAvatarParams,
): Promise<string> {
    const { avatar_url } = await userPort.uploadAvatar(
        params.idpUrl,
        params.accessToken,
        params.avatar,
    )
    params.setAvatarUrl(avatar_url)
    return avatar_url
}
