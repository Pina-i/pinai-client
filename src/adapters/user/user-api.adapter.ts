import ky, { HTTPError } from "ky"
import type { IUserPort } from "@/domain/ports/user.port"

export class UserApiAdapter implements IUserPort {
    async uploadAvatar(
        idpUrl: string,
        accessToken: string,
        blob: Blob,
        contentType: string,
    ): Promise<{ avatar_url: string }> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/avatar`
        try {
            return await ky.put(url, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": contentType,
                },
                body: blob,
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
}
