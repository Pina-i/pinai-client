import ky from "ky"
import { idpErrorFrom } from "../idp-error"
import type { Attachment, ConversationHistory, DirectMessage, DmConversationSummary } from "@pinai/domain/models/dm"
import type { GroupEvent } from "@pinai/domain/models/group-event"
import type { LocalFile } from "@pinai/domain/models/file"
import type { DmCursor, IDmPort, UploadProgress } from "@pinai/domain/ports/dm.port"

/** An event item of the history, in the REST API's casing: the WebSocket's `group_event` is camelCase. */
interface HistoryEvent {
    kind: "event"
    id: string
    conversation_id: string
    event: GroupEvent["event"]
    actor_uri: string
    actor_display_name: string | null
    subject_uri?: string
    subject_display_name?: string | null
    name?: string
    role?: GroupEvent["role"]
    created_at: string
}

type HistoryItem = (DirectMessage & { kind: "message" }) | HistoryEvent

function groupEventFrom(item: HistoryEvent): GroupEvent {
    return {
        id: item.id,
        conversationId: item.conversation_id,
        event: item.event,
        actorUri: item.actor_uri,
        actorDisplayName: item.actor_display_name,
        ...(item.subject_uri !== undefined && { subjectUri: item.subject_uri }),
        ...(item.subject_display_name !== undefined && { subjectDisplayName: item.subject_display_name }),
        ...(item.name !== undefined && { name: item.name }),
        ...(item.role !== undefined && { role: item.role }),
        createdAt: item.created_at,
    }
}

export class DmApiAdapter implements IDmPort {
    async listConversations(idpUrl: string, accessToken: string): Promise<DmConversationSummary[]> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/dm`
        try {
            return await ky.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            }).json<DmConversationSummary[]>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to fetch DM conversations")
        }
    }

    async getConversation(
        idpUrl: string,
        accessToken: string,
        conversationId: string,
        cursor?: DmCursor,
    ): Promise<ConversationHistory> {
        const base = `${idpUrl.replace(/\/$/, "")}/api/dm/${encodeURIComponent(conversationId)}`
        const searchParams = new URLSearchParams({ include: "events" })
        if (cursor) {
            searchParams.set("cursor_created_at", cursor.created_at)
            searchParams.set("cursor_id", cursor.id)
        }
        let items: HistoryItem[]
        try {
            items = await ky.get(base, {
                headers: { Authorization: `Bearer ${accessToken}` },
                searchParams,
            }).json<HistoryItem[]>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to fetch conversation")
        }
        const history: ConversationHistory = { messages: [], events: [] }
        for (const item of items) {
            if (item.kind === "event") history.events.push(groupEventFrom(item))
            else history.messages.push(item)
        }
        return history
    }

    async sendMessage(
        idpUrl: string,
        accessToken: string,
        recipientAddress: string,
        mlsCiphertext: string,
        replyToId?: string,
        attachmentIds?: string[],
        conversationId?: string,
        clientId?: string,
    ): Promise<DirectMessage> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/dm`
        const json: Record<string, unknown> = {
            recipient_address: recipientAddress,
            mls_ciphertext: mlsCiphertext,
        }
        if (replyToId) json.reply_to_id = replyToId
        if (attachmentIds && attachmentIds.length > 0) json.attachment_ids = attachmentIds
        if (conversationId) json.conversation_id = conversationId
        if (clientId) json.client_id = clientId
        try {
            return await ky.post(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json,
            }).json<DirectMessage>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to send message")
        }
    }

    /** XHR-based to surface upload progress events that fetch/ky don't expose. */
    uploadAttachment(
        idpUrl: string,
        accessToken: string,
        file: LocalFile,
        onProgress?: UploadProgress,
        signal?: AbortSignal,
        attachmentId?: string,
    ): Promise<Attachment> {
        return new Promise<Attachment>((resolve, reject) => {
            const url = `${idpUrl.replace(/\/$/, "")}/api/attachments`
            const xhr = new XMLHttpRequest()
            xhr.open("POST", url)
            xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`)
            xhr.responseType = "json"

            if (onProgress) {
                xhr.upload.addEventListener("progress", (e) => {
                    if (e.lengthComputable) onProgress(e.loaded, e.total)
                })
            }

            xhr.addEventListener("load", () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const body = xhr.response as { attachments?: Attachment[] }
                    const first = body?.attachments?.[0]
                    if (first) resolve(first)
                    else reject(new Error("Upload returned no attachment"))
                } else {
                    const message = (xhr.response && (xhr.response as { error?: string }).error)
                        || `Upload failed: ${xhr.status}`
                    reject(new Error(message))
                }
            })
            xhr.addEventListener("error", () => reject(new Error("Network error during upload")))
            xhr.addEventListener("abort", () => reject(new DOMException("Upload aborted", "AbortError")))

            if (signal) {
                if (signal.aborted) {
                    xhr.abort()
                    return
                }
                signal.addEventListener("abort", () => xhr.abort(), { once: true })
            }

            const form = new FormData()
            // The `attachment_id` field MUST come before the file part
            // because the server iterates parts in order and reads the
            // id before pairing it with the single file.
            if (attachmentId) form.append("attachment_id", attachmentId)
            const part = new File([file.bytes as BlobPart], file.name, { type: file.mimeType })
            form.append("file", part, file.name)
            xhr.send(form)
        })
    }

    async getAttachmentBlobUrl(
        idpUrl: string,
        accessToken: string,
        attachmentId: string,
    ): Promise<string> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/attachments/${encodeURIComponent(attachmentId)}`
        try {
            const body = await ky.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            }).json<{ url: string }>()
            return body.url
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to resolve attachment")
        }
    }

    async markConversationRead(
        idpUrl: string,
        accessToken: string,
        conversationId: string,
    ): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/dm/${encodeURIComponent(conversationId)}/read`
        try {
            await ky.post(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            })
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to mark conversation as read")
        }
    }

    async editMessage(idpUrl: string, accessToken: string, messageId: string, mlsCiphertext: string): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/dm/${messageId}/edit`
        try {
            await ky.patch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json: { mls_ciphertext: mlsCiphertext },
            })
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to edit message")
        }
    }
}
