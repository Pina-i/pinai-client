import type { DirectMessage, DmConversationSummary } from "@/domain/models/dm"
import type { DmCursor, IDmPort } from "@/domain/ports/dm.port"

export class DmApiAdapter implements IDmPort {
    async listConversations(idpUrl: string, accessToken: string): Promise<DmConversationSummary[]> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/dm`
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string }
            throw new Error(err.error ?? `Failed to fetch DM conversations: ${res.status}`)
        }
        return res.json() as Promise<DmConversationSummary[]>
    }

    async getConversation(
        idpUrl: string,
        accessToken: string,
        address: string,
        cursor?: DmCursor,
    ): Promise<DirectMessage[]> {
        const base = `${idpUrl.replace(/\/$/, "")}/api/dm/${encodeURIComponent(address)}`
        const params = new URLSearchParams()
        if (cursor) {
            params.set("cursor_created_at", cursor.created_at)
            params.set("cursor_id", cursor.id)
        }
        const url = params.size ? `${base}?${params}` : base
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string }
            throw new Error(err.error ?? `Failed to fetch conversation: ${res.status}`)
        }
        return res.json() as Promise<DirectMessage[]>
    }
}
