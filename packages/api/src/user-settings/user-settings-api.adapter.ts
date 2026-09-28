import ky, { HTTPError } from "ky"
import type { AccountSettings } from "@pinai/domain/models/user-settings"
import type { IAccountSettingsPort } from "@pinai/domain/ports/user-settings.port"

export class UserSettingsApiAdapter implements IAccountSettingsPort {
    /** `PATCH /api/settings` — replaces the sections sent, keeps the others, returns the merged document. */
    async update(idpUrl: string, accessToken: string, sections: Partial<AccountSettings>): Promise<unknown> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/settings`
        try {
            return await ky.patch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json: sections,
            }).json<unknown>()
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Failed to save settings: ${error.response.status}`)
            }
            throw error
        }
    }
}
