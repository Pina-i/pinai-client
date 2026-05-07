import type { ProfilePatch, UserProfile } from "@/domain/models/auth"
import type { IUserPort } from "@/domain/ports/user.port"

export interface UpdateProfileParams {
    idpUrl: string
    accessToken: string
    patch: ProfilePatch
    setUser: (next: UserProfile) => void
}

export async function updateProfileUseCase(
    userPort: IUserPort,
    params: UpdateProfileParams,
): Promise<UserProfile> {
    const updated = await userPort.updateProfile(
        params.idpUrl,
        params.accessToken,
        params.patch,
    )
    params.setUser(updated)
    return updated
}
