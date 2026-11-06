import { HTTPError } from "ky"
import { idp } from "../http"
import { idpErrorFrom } from "../idp-error"

import type {
    ArchiveEntry,
    ArchivePage,
    ArchivePageCursor,
    IHistoryArchivePort,
} from "@pinai/domain/ports/history-archive.port"
import { base64ToBytes, bytesToBase64, decodeBase64 } from "@pinai/domain/lib/bytes"
import { ARCHIVE_UPLOAD_LIMIT } from "@pinai/domain/models/history-archive"
import { isGeneration, type CurrentHistoryKey, type HistoryKey } from "@pinai/domain/models/history-key"

/** REST client for `/api/history/*`. Base64 in/out; no crypto here. */
export class HistoryArchiveApiAdapter implements IHistoryArchivePort {
    async getKey(idpUrl: string, accessToken: string): Promise<CurrentHistoryKey | null> {
        let body: unknown
        try {
            body = await idp
                .get(`${base(idpUrl)}/api/history/key`, { headers: auth(accessToken) })
                .json<unknown>()
        } catch (error) {
            if (error instanceof HTTPError && error.response.status === 404) return null
            throw await idpErrorFrom(error, "Reading the history key failed")
        }
        const key = parseHistoryKey(body)
        if (!key) throw new Error("The IdP answered a history key that isn't one")
        return key
    }

    async setKey(idpUrl: string, accessToken: string, key: HistoryKey): Promise<void> {
        try {
            await idp.put(`${base(idpUrl)}/api/history/key`, {
                headers: auth(accessToken),
                json: {
                    generation: key.generation,
                    salt: bytesToBase64(key.salt),
                    check_value: bytesToBase64(key.checkValue),
                    approval_public_key: bytesToBase64(key.approvalPublicKey),
                },
            })
        } catch (error) {
            throw await idpErrorFrom(error, "Setting the history key failed")
        }
    }

    async uploadBatch(
        idpUrl: string,
        accessToken: string,
        generation: number,
        entries: ArchiveEntry[],
    ): Promise<number> {
        if (entries.length === 0) return 0
        if (entries.length > ARCHIVE_UPLOAD_LIMIT) {
            throw new Error(`uploadBatch: batch size ${entries.length} exceeds cap ${ARCHIVE_UPLOAD_LIMIT}`)
        }
        const body = {
            generation,
            entries: entries.map((e) => ({
                id: e.id,
                conversation_id: e.conversation_id,
                ciphertext: bytesToBase64(e.ciphertext),
                nonce: bytesToBase64(e.nonce),
                client_message_id: e.client_message_id,
            })),
        }
        try {
            const res = await idp
                .post(`${base(idpUrl)}/api/history/messages`, { headers: auth(accessToken), json: body })
                .json<{ inserted: number }>()
            return res.inserted
        } catch (error) {
            throw await idpErrorFrom(error, "Backing up messages failed")
        }
    }

    async downloadPage(
        idpUrl: string,
        accessToken: string,
        cursor: ArchivePageCursor | null,
        limit = 100,
    ): Promise<ArchivePage> {
        const url = new URL(`${base(idpUrl)}/api/history/messages`)
        url.searchParams.set("limit", String(limit))
        if (cursor) {
            url.searchParams.set("after_id", cursor.after_id)
            url.searchParams.set("after_created_at", cursor.after_created_at)
        }
        const body = await idp
            .get(url.toString(), { headers: auth(accessToken) })
            .json<{
                entries: Array<{
                    id: string
                    conversation_id: string
                    ciphertext: string
                    nonce: string
                    client_message_id?: string
                    created_at: string
                }>
                next_cursor: ArchivePageCursor | null
            }>()
        return {
            entries: body.entries.map((e) => ({
                id: e.id,
                conversation_id: e.conversation_id,
                ciphertext: base64ToBytes(e.ciphertext),
                nonce: base64ToBytes(e.nonce),
                client_message_id: e.client_message_id,
                created_at: e.created_at,
            })),
            next_cursor: body.next_cursor,
        }
    }

    async wipeArchive(idpUrl: string, accessToken: string): Promise<number> {
        try {
            const res = await idp
                .delete(`${base(idpUrl)}/api/history/messages`, { headers: auth(accessToken) })
                .json<{ deleted: number }>()
            return res.deleted
        } catch (error) {
            throw await idpErrorFrom(error, "Clearing the history backup failed")
        }
    }
}

/** `GET /api/history/key`'s answer, or `null` when a field isn't what it must be. */
export function parseHistoryKey(body: unknown): CurrentHistoryKey | null {
    if (typeof body !== "object" || body === null) return null
    const row = body as Record<string, unknown>
    const salt = decodeBase64(row.salt, 16)
    const checkValue = decodeBase64(row.check_value, 32)
    const approvalPublicKey = decodeBase64(row.approval_public_key, 32)
    const setByDevice = row.set_by_device
    if (!isGeneration(row.generation) || !salt || !checkValue || !approvalPublicKey) return null
    if (setByDevice !== null && setByDevice !== undefined && typeof setByDevice !== "string") return null
    return { generation: row.generation, salt, checkValue, approvalPublicKey, setByDevice: setByDevice ?? null }
}

function base(idpUrl: string): string {
    return idpUrl.replace(/\/$/, "")
}

function auth(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}` }
}
