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

    async sendMessage(
        idpUrl: string,
        accessToken: string,
        recipientAddress: string,
        content: string,
        replyToId?: string,
    ): Promise<DirectMessage> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/dm`
        const body: Record<string, unknown> = { recipient_address: recipientAddress, content }
        if (replyToId) body.reply_to_id = replyToId
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        })
        if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string }
            throw new Error(err.error ?? `Failed to send message: ${res.status}`)
        }
        return res.json() as Promise<DirectMessage>
    }

    async addReaction(idpUrl: string, accessToken: string, messageId: string, emoji: string): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/dm/${messageId}/reactions`
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ emoji }),
        })
        if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string }
            throw new Error(err.error ?? `Failed to add reaction: ${res.status}`)
        }
    }

    async removeReaction(idpUrl: string, accessToken: string, messageId: string, emoji: string): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/dm/${messageId}/reactions?emoji=${encodeURIComponent(emoji)}`
        const res = await fetch(url, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string }
            throw new Error(err.error ?? `Failed to remove reaction: ${res.status}`)
        }
    }
}
