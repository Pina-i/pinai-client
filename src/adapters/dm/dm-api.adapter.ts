import ky, { HTTPError } from "ky"
import type { DirectMessage, DmConversationSummary } from "@/domain/models/dm"
import type { DmCursor, IDmPort } from "@/domain/ports/dm.port"

export class DmApiAdapter implements IDmPort {
    async listConversations(idpUrl: string, accessToken: string): Promise<DmConversationSummary[]> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/dm`
        try {
            return await ky.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            }).json<DmConversationSummary[]>()
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Failed to fetch DM conversations: ${error.response.status}`)
            }
            throw error
        }
    }

    async getConversation(
        idpUrl: string,
        accessToken: string,
        address: string,
        cursor?: DmCursor,
    ): Promise<DirectMessage[]> {
        const base = `${idpUrl.replace(/\/$/, "")}/api/dm/${encodeURIComponent(address)}`
        const searchParams = new URLSearchParams()
        if (cursor) {
            searchParams.set("cursor_created_at", cursor.created_at)
            searchParams.set("cursor_id", cursor.id)
        }
        try {
            return await ky.get(base, {
                headers: { Authorization: `Bearer ${accessToken}` },
                ...(cursor && { searchParams }),
            }).json<DirectMessage[]>()
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Failed to fetch conversation: ${error.response.status}`)
            }
            throw error
        }
    }

    async sendMessage(
        idpUrl: string,
        accessToken: string,
        recipientAddress: string,
        content: string,
        replyToId?: string,
    ): Promise<DirectMessage> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/dm`
        const json: Record<string, unknown> = { recipient_address: recipientAddress, content }
        if (replyToId) json.reply_to_id = replyToId
        try {
            return await ky.post(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json,
            }).json<DirectMessage>()
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Failed to send message: ${error.response.status}`)
            }
            throw error
        }
    }

    async addReaction(idpUrl: string, accessToken: string, messageId: string, emoji: string): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/dm/${messageId}/reactions`
        try {
            await ky.post(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json: { emoji },
            })
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Failed to add reaction: ${error.response.status}`)
            }
            throw error
        }
    }

    async removeReaction(idpUrl: string, accessToken: string, messageId: string, emoji: string): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/dm/${messageId}/reactions`
        try {
            await ky.delete(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                searchParams: { emoji },
            })
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Failed to remove reaction: ${error.response.status}`)
            }
            throw error
        }
    }

    async editMessage(idpUrl: string, accessToken: string, messageId: string, content: string): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/dm/${messageId}/edit`
        try {
            await ky.patch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json: { content },
            })
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Failed to edit message: ${error.response.status}`)
            }
            throw error
        }
    }
}
