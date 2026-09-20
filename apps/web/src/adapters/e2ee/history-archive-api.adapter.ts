import ky, { HTTPError } from "ky"

import type {
    ArchiveEntry,
    ArchivePage,
    ArchivePageCursor,
    IHistoryArchivePort,
} from "@/domain/ports/history-archive.port"
import { base64ToBytes, bytesToBase64 } from "@/lib/utils-bytes"

const BATCH_MAX = 50

/** REST client for `/api/history/*`. Base64 in/out; no crypto here. */
export class HistoryArchiveApiAdapter implements IHistoryArchivePort {
    async uploadBatch(
        idpUrl: string,
        accessToken: string,
        entries: ArchiveEntry[],
    ): Promise<number> {
        if (entries.length === 0) return 0
        if (entries.length > BATCH_MAX) {
            throw new Error(`uploadBatch: batch size ${entries.length} exceeds cap ${BATCH_MAX}`)
        }
        const body = {
            entries: entries.map((e) => ({
                id: e.id,
                conversation_id: e.conversation_id,
                ciphertext: bytesToBase64(e.ciphertext),
                nonce: bytesToBase64(e.nonce),
                client_message_id: e.client_message_id,
            })),
        }
        const res = await ky
            .post(`${idpUrl.replace(/\/$/, "")}/api/history/messages`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json: body,
            })
            .json<{ inserted: number }>()
        return res.inserted
    }

    async downloadPage(
        idpUrl: string,
        accessToken: string,
        cursor: ArchivePageCursor | null,
        limit = 100,
    ): Promise<ArchivePage> {
        const url = new URL(`${idpUrl.replace(/\/$/, "")}/api/history/messages`)
        url.searchParams.set("limit", String(limit))
        if (cursor) {
            url.searchParams.set("after_id", cursor.after_id)
            url.searchParams.set("after_created_at", cursor.after_created_at)
        }
        const body = await ky
            .get(url.toString(), {
                headers: { Authorization: `Bearer ${accessToken}` },
            })
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
        const res = await ky
            .delete(`${idpUrl.replace(/\/$/, "")}/api/history/messages`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            })
            .json<{ deleted: number }>()
        return res.deleted
    }

    async getSalt(idpUrl: string, accessToken: string): Promise<Uint8Array | null> {
        try {
            const res = await ky
                .get(`${idpUrl.replace(/\/$/, "")}/api/history/salt`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                })
                .json<{ salt_base64: string }>()
            return base64ToBytes(res.salt_base64)
        } catch (err) {
            if (err instanceof HTTPError && err.response.status === 404) return null
            throw err
        }
    }

    async setSalt(idpUrl: string, accessToken: string, salt: Uint8Array): Promise<Uint8Array> {
        const res = await ky
            .post(`${idpUrl.replace(/\/$/, "")}/api/history/salt`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json: { salt_base64: bytesToBase64(salt) },
            })
            .json<{ salt_base64: string }>()
        return base64ToBytes(res.salt_base64)
    }
}
