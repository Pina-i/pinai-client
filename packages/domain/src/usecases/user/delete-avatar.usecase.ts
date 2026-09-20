import type { IUserPort } from "../../ports/user.port"

export interface DeleteAvatarParams {
    idpUrl: string
    accessToken: string
    setAvatarUrl: (url: string | null) => void
}

export async function deleteAvatarUseCase(
    userPort: IUserPort,
    params: DeleteAvatarParams,
): Promise<void> {
    await userPort.deleteAvatar(params.idpUrl, params.accessToken)
    params.setAvatarUrl(null)
}
