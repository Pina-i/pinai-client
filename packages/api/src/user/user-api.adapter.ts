import ky, { HTTPError } from "ky"
import type { ProfilePatch, UserProfile } from "@pinai/domain/models/auth"
import type { LocalFile } from "@pinai/domain/models/file"
import type { ProfileCard } from "@pinai/domain/models/profile"
import type { IUserPort } from "@pinai/domain/ports/user.port"
import { idpErrorFrom } from "../idp-error"

export class UserApiAdapter implements IUserPort {
    async uploadAvatar(
        idpUrl: string,
        accessToken: string,
        avatar: LocalFile,
    ): Promise<{ avatar_url: string }> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/avatar`
        try {
            return await ky.put(url, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": avatar.mimeType,
                },
                body: new Blob([avatar.bytes as BlobPart], { type: avatar.mimeType }),
            }).json<{ avatar_url: string }>()
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Failed to upload avatar: ${error.response.status}`)
            }
            throw error
        }
    }

    async deleteAvatar(idpUrl: string, accessToken: string): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/avatar`
        try {
            await ky.delete(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            })
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Failed to delete avatar: ${error.response.status}`)
            }
            throw error
        }
    }

    async updateProfile(
        idpUrl: string,
        accessToken: string,
        patch: ProfilePatch,
    ): Promise<UserProfile> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/profile`
        try {
            return await ky.patch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json: patch,
            }).json<UserProfile>()
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Failed to update profile: ${error.response.status}`)
            }
            throw error
        }
    }

    async getProfileCard(
        idpUrl: string,
        accessToken: string,
        actorUri: string,
    ): Promise<ProfileCard | null> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/profiles`
        try {
            return await ky.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                searchParams: { actor: actorUri },
            }).json<ProfileCard>()
        } catch (error) {
            if (error instanceof HTTPError && error.response.status === 404) return null
            throw await idpErrorFrom(error, "Failed to read the profile")
        }
    }
}
