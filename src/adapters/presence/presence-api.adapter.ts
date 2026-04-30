import ky, { HTTPError } from "ky"
import type { PresenceSnapshotEntry } from "@/domain/models/presence"
import type { IPresencePort } from "@/domain/ports/presence.port"

interface PresenceResponse {
    presence: PresenceSnapshotEntry[]
}

export class PresenceApiAdapter implements IPresencePort {
    async getPresence(
        idpUrl: string,
        accessToken: string,
        actorUris: string[],
    ): Promise<PresenceSnapshotEntry[]> {
        if (actorUris.length === 0) return []

        const url = `${idpUrl.replace(/\/$/, "")}/api/presence`
        const searchParams = new URLSearchParams()
        for (const uri of actorUris) searchParams.append("actors[]", uri)

        try {
            const res = await ky
                .get(url, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    searchParams,
                })
                .json<PresenceResponse>()
            return res.presence ?? []
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = (await error.response.json().catch(() => ({}))) as { error?: string }
                throw new Error(err.error ?? `Failed to fetch presence: ${error.response.status}`)
            }
            throw error
        }
    }
}
