import ky, { HTTPError } from "ky"
import type { Attachment, DirectMessage, DmConversationSummary } from "@pinai/domain/models/dm"
import type { LocalFile } from "@pinai/domain/models/file"
import type { DmCursor, IDmPort, UploadProgress } from "@pinai/domain/ports/dm.port"

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
        conversationId: string,
        cursor?: DmCursor,
    ): Promise<DirectMessage[]> {
        const base = `${idpUrl.replace(/\/$/, "")}/api/dm/${encodeURIComponent(conversationId)}`
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
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Failed to send message: ${error.response.status}`)
            }
            throw error
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
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Failed to resolve attachment: ${error.response.status}`)
            }
            throw error
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
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Failed to mark conversation as read: ${error.response.status}`)
            }
            throw error
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
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Failed to edit message: ${error.response.status}`)
            }
            throw error
        }
    }
}
