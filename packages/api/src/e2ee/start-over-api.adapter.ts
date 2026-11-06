import { HTTPError } from "ky"

import { START_OVER_ENDS, type StartOverRequest } from "@pinai/domain/models/start-over"
import type { AskedStartOver, IStartOverPort } from "@pinai/domain/ports/start-over.port"

import { idp } from "../http"
import { idpErrorFrom } from "../idp-error"

/** REST client for `/api/history/start-over` (`identity-provider/specs/e2ee.md § 3.12`); times as epoch ms. */
export class StartOverApiAdapter implements IStartOverPort {
    async ask(idpUrl: string, accessToken: string): Promise<AskedStartOver> {
        let body: unknown
        try {
            body = await idp.post(`${base(idpUrl)}/api/history/start-over`, { headers: auth(accessToken) }).json<unknown>()
        } catch (error) {
            throw await idpErrorFrom(error, "Asking to start over failed")
        }
        const asked = parseAsked(body)
        if (!asked) throw new Error("The IdP answered a start over request that isn't one")
        return asked
    }

    async read(idpUrl: string, accessToken: string): Promise<StartOverRequest | null> {
        let body: unknown
        try {
            body = await idp.get(`${base(idpUrl)}/api/history/start-over`, { headers: auth(accessToken) }).json<unknown>()
        } catch (error) {
            if (error instanceof HTTPError && error.response.status === 404) return null
            throw await idpErrorFrom(error, "Reading the start over request failed")
        }
        const request = parseStartOverRequest(body)
        if (!request) throw new Error("The IdP answered a start over request that isn't one")
        return request
    }

    async end(idpUrl: string, accessToken: string, requestId: string): Promise<void> {
        try {
            await idp.delete(`${base(idpUrl)}/api/history/start-over/${encodeURIComponent(requestId)}`, { headers: auth(accessToken) })
        } catch (error) {
            throw await idpErrorFrom(error, "Ending the start over request failed")
        }
    }
}

function record(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null
}

function instant(value: unknown): number | null {
    if (typeof value !== "string") return null
    const at = Date.parse(value)
    return Number.isNaN(at) ? null : at
}

function parseAsked(body: unknown): AskedStartOver | null {
    const row = record(body)
    const createdAt = instant(row?.created_at)
    const readyAt = instant(row?.ready_at)
    if (!row || typeof row.id !== "string" || createdAt === null || readyAt === null) return null
    return { id: row.id.toLowerCase(), createdAt, readyAt }
}

/** `GET /api/history/start-over`'s body; `null` for anything else. Ids lowercased, as the IdP writes UUIDs. */
function parseStartOverRequest(body: unknown): StartOverRequest | null {
    const asked = parseAsked(body)
    const row = record(body)
    if (!asked || !row || typeof row.device_id !== "string") return null
    let ended: StartOverRequest["ended"] = null
    if (row.ended != null) {
        const end = record(row.ended)
        const at = instant(end?.at)
        const reason = START_OVER_ENDS.find((r) => r === end?.reason)
        if (at === null || !reason) return null
        ended = { reason, at }
    }
    return {
        ...asked,
        deviceId: row.device_id.toLowerCase(),
        displayName: typeof row.display_name === "string" ? row.display_name : "",
        ended,
    }
}

function base(idpUrl: string): string {
    return idpUrl.replace(/\/$/, "")
}

function auth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` }
}
