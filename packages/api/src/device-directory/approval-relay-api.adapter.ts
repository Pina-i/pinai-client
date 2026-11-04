import { idp } from "../http"
import { idpErrorFrom } from "../idp-error"

import { bytesToBase64, decodeBase64 } from "@pinai/domain/lib/bytes"
import { canonicalId, type ApprovalRequest, type RelayMessage } from "@pinai/domain/models/approval-handshake"
import type { IApprovalRelayPort } from "@pinai/domain/ports/approval-relay.port"

import { isRow } from "./device-directory-api.adapter"

/** `/api/keys/devices/approval-requests`: the code handshake's relay. Every refusal is an `IdpError`. */
export class ApprovalRelayApiAdapter implements IApprovalRelayPort {
    async openRequest(idpUrl: string, accessToken: string): Promise<{ id: string; expiresAt: string }> {
        try {
            const body = await idp.post(requestsUrl(idpUrl), { headers: auth(accessToken) }).json<unknown>()
            const id = isRow(body) ? canonicalId(body.id) : null
            if (!isRow(body) || !id || typeof body.expires_at !== "string") throw new Error("The IdP's answer names no request")
            return { id, expiresAt: body.expires_at }
        } catch (error) {
            throw await idpErrorFrom(error, "Asking for approval failed")
        }
    }

    async openRequests(idpUrl: string, accessToken: string): Promise<ApprovalRequest[]> {
        try {
            const body = await idp.get(requestsUrl(idpUrl), { headers: auth(accessToken) }).json<unknown>()
            return parseApprovalRequests(body)
        } catch (error) {
            throw await idpErrorFrom(error, "Reading the approval requests failed")
        }
    }

    async post(idpUrl: string, accessToken: string, requestId: string, body: Uint8Array): Promise<number> {
        try {
            const answer = await idp
                .post(messagesUrl(idpUrl, requestId), { headers: auth(accessToken), json: { body: bytesToBase64(body) } })
                .json<unknown>()
            if (!isRow(answer) || typeof answer.seq !== "number") throw new Error("The IdP's answer names no message")
            return answer.seq
        } catch (error) {
            throw await idpErrorFrom(error, "Sending to the other device failed")
        }
    }

    async read(idpUrl: string, accessToken: string, requestId: string, after: number): Promise<RelayMessage[]> {
        try {
            const body = await idp
                .get(messagesUrl(idpUrl, requestId), { headers: auth(accessToken), searchParams: { after } })
                .json<unknown>()
            return parseRelayMessages(body)
        } catch (error) {
            throw await idpErrorFrom(error, "Reading from the other device failed")
        }
    }

    async close(idpUrl: string, accessToken: string, requestId: string, options?: { keepalive?: boolean }): Promise<void> {
        try {
            await idp.delete(requestUrl(idpUrl, requestId), { headers: auth(accessToken), keepalive: options?.keepalive })
        } catch (error) {
            throw await idpErrorFrom(error, "Ending the approval request failed")
        }
    }
}

/** Ids as § 7.2 writes them, lowercase; a row missing a field, or naming no UUID, is left out. */
export function parseApprovalRequests(body: unknown): ApprovalRequest[] {
    const rows = isRow(body) && Array.isArray(body.requests) ? body.requests.filter(isRow) : []
    return rows.flatMap((row) => {
        const id = canonicalId(row.id)
        const deviceId = canonicalId(row.device_id)
        const approver = row.approver_device_id == null ? null : canonicalId(row.approver_device_id)
        const { display_name, created_at, expires_at } = row
        if (!id || !deviceId || (row.approver_device_id != null && approver === null)) return []
        if (typeof created_at !== "string" || typeof expires_at !== "string") return []
        return [
            {
                id,
                deviceId,
                displayName: typeof display_name === "string" ? display_name : "",
                approverDeviceId: approver,
                createdAt: created_at,
                expiresAt: expires_at,
            },
        ]
    })
}

/** A body that isn't base64 is kept empty: the handshake then refuses it as out of format. */
export function parseRelayMessages(body: unknown): RelayMessage[] {
    const rows = isRow(body) && Array.isArray(body.messages) ? body.messages.filter(isRow) : []
    return rows.flatMap((row) => {
        const deviceId = canonicalId(row.device_id)
        if (typeof row.seq !== "number" || !deviceId) return []
        return [
            {
                seq: row.seq,
                deviceId,
                body: decodeBase64(row.body) ?? new Uint8Array(0),
                createdAt: typeof row.created_at === "string" ? row.created_at : "",
            },
        ]
    })
}

function requestsUrl(idpUrl: string): string {
    return `${idpUrl.replace(/\/$/, "")}/api/keys/devices/approval-requests`
}

function requestUrl(idpUrl: string, requestId: string): string {
    return `${requestsUrl(idpUrl)}/${encodeURIComponent(requestId)}`
}

function messagesUrl(idpUrl: string, requestId: string): string {
    return `${requestUrl(idpUrl, requestId)}/messages`
}

function auth(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}` }
}
