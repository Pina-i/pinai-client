import type { ProfilePatch, UserProfile } from "../models/auth"
import type { LocalFile } from "../models/file"

export interface IUserPort {
    uploadAvatar(
        idpUrl: string,
        accessToken: string,
        avatar: LocalFile,
    ): Promise<{ avatar_url: string }>

    deleteAvatar(idpUrl: string, accessToken: string): Promise<void>

    updateProfile(
        idpUrl: string,
        accessToken: string,
        patch: ProfilePatch,
    ): Promise<UserProfile>
}
