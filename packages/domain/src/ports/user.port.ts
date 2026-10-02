import type { ProfilePatch, UserProfile } from "../models/auth"
import type { LocalFile } from "../models/file"
import type { ProfileCard } from "../models/profile"

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

    /** `null` when the IdP shows the viewer nothing of the account. */
    getProfileCard(
        idpUrl: string,
        accessToken: string,
        actorUri: string,
    ): Promise<ProfileCard | null>
}
