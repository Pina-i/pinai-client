/**
 * The code handshake's routes as the client calls them (`identity-provider/specs/e2ee.md § 5`,
 * "Approvals"): a request opened, listed, posted to, read after a `seq` and closed, a device
 * approved by another's root key — bytes as standard base64 — and the refusals told apart by
 * their code.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { ApprovalRelayApiAdapter } from "@pinai/api/device-directory/approval-relay-api.adapter"
import { DeviceDirectoryApiAdapter } from "@pinai/api/device-directory/device-directory-api.adapter"
import { bytesToBase64 } from "@pinai/domain/lib/bytes"
import { relayRefusal, isTooManyRequests } from "@pinai/domain/models/approval-handshake"
import { IdpError } from "@pinai/domain/models/idp-error"

const IDP = "http://localhost:8097"
const REQUEST = "0190c7a2-0000-7000-8000-000000000001"
const DEVICE = "550e8400-e29b-41d4-a716-446655440000"

function answering(status: number, body?: unknown) {
    const bodies: string[] = []
    const fetch = vi.fn(async (request: Request) => {
        bodies.push(await request.clone().text())
        return new Response(body === undefined ? null : JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
        })
    })
    vi.stubGlobal("fetch", fetch)
    return Object.assign(fetch, { bodies })
}

async function sent(fetch: ReturnType<typeof answering>) {
    const request = fetch.mock.calls[0][0] as Request
    const url = new URL(request.url)
    return {
        method: request.method,
        path: url.pathname,
        query: url.search,
        auth: request.headers.get("Authorization"),
        body: fetch.bodies[0],
    }
}

const relay = new ApprovalRelayApiAdapter()

describe("ApprovalRelayApiAdapter", () => {
    afterEach(() => vi.unstubAllGlobals())

    it("opens a request for the session's device", async () => {
        const fetch = answering(201, { id: REQUEST, expires_at: "2026-11-04T12:10:00Z" })

        expect(await relay.openRequest(`${IDP}/`, "tok")).toEqual({ id: REQUEST, expiresAt: "2026-11-04T12:10:00Z" })
        expect(await sent(fetch)).toMatchObject({ method: "POST", path: "/api/keys/devices/approval-requests", auth: "Bearer tok" })
    })

    it("lists the open requests, leaving out a row it can't answer", async () => {
        answering(200, {
            requests: [
                {
                    id: REQUEST,
                    device_id: DEVICE,
                    display_name: "Chrome on Android",
                    approver_device_id: null,
                    created_at: "2026-11-04T12:00:00Z",
                    expires_at: "2026-11-04T12:10:00Z",
                },
                { id: "broken", device_id: DEVICE },
            ],
        })

        expect(await relay.openRequests(IDP, "tok")).toEqual([
            {
                id: REQUEST,
                deviceId: DEVICE,
                displayName: "Chrome on Android",
                approverDeviceId: null,
                createdAt: "2026-11-04T12:00:00Z",
                expiresAt: "2026-11-04T12:10:00Z",
            },
        ])
    })

    it("posts a body as standard base64 and answers its seq", async () => {
        const fetch = answering(201, { seq: 2 })

        expect(await relay.post(IDP, "tok", REQUEST, Uint8Array.of(1, 2, 255))).toBe(2)
        expect(await sent(fetch)).toMatchObject({
            method: "POST",
            path: `/api/keys/devices/approval-requests/${REQUEST}/messages`,
            body: JSON.stringify({ body: "AQL/" }),
        })
    })

    it("reads the messages after a seq, their bodies decoded", async () => {
        const fetch = answering(200, {
            messages: [{ seq: 3, device_id: DEVICE, body: bytesToBase64(Uint8Array.of(1, 4)), created_at: "2026-11-04T12:01:00Z" }],
        })

        expect(await relay.read(IDP, "tok", REQUEST, 2)).toEqual([
            { seq: 3, deviceId: DEVICE, body: Uint8Array.of(1, 4), createdAt: "2026-11-04T12:01:00Z" },
        ])
        expect(await sent(fetch)).toMatchObject({ method: "GET", query: "?after=2" })
    })

    it("closes a request, one that outlives the page when asked", async () => {
        const fetch = answering(204)

        await relay.close(IDP, "tok", REQUEST, { keepalive: true })
        expect(await sent(fetch)).toMatchObject({ method: "DELETE", path: `/api/keys/devices/approval-requests/${REQUEST}` })
        expect((fetch.mock.calls[0][0] as Request).keepalive).toBe(true)
    })

    it("writes the ids it reads as § 7.2 does, and leaves out a row naming no UUID", async () => {
        answering(200, {
            messages: [
                { seq: 1, device_id: DEVICE.toUpperCase(), body: "AQ==", created_at: "2026-11-04T12:01:00Z" },
                { seq: 2, device_id: "laptop", body: "AQ==", created_at: "2026-11-04T12:01:00Z" },
            ],
        })
        expect((await relay.read(IDP, "tok", REQUEST, 0)).map((m) => m.deviceId)).toEqual([DEVICE])

        answering(200, {
            requests: [
                {
                    id: REQUEST.toUpperCase(),
                    device_id: DEVICE,
                    display_name: "Chrome on Android",
                    approver_device_id: "someone",
                    created_at: "2026-11-04T12:00:00Z",
                    expires_at: "2026-11-04T12:10:00Z",
                },
                {
                    id: REQUEST.toUpperCase(),
                    device_id: DEVICE.toUpperCase(),
                    display_name: "Chrome on Android",
                    approver_device_id: null,
                    created_at: "2026-11-04T12:00:00Z",
                    expires_at: "2026-11-04T12:10:00Z",
                },
            ],
        })
        expect(await relay.openRequests(IDP, "tok")).toMatchObject([{ id: REQUEST, deviceId: DEVICE, approverDeviceId: null }])
    })

    it("raises the relay's refusals as IdpErrors the handshake tells apart", async () => {
        const refused = async (status: number, error: string, call: () => Promise<unknown>) => {
            answering(status, { error, error_description: "refused" })
            return call().catch((e: unknown) => e)
        }

        const taken = await refused(409, "approval_request_taken", () => relay.read(IDP, "tok", REQUEST, 0))
        const ended = await refused(410, "approval_request_ended", () => relay.post(IDP, "tok", REQUEST, Uint8Array.of(1)))
        const limited = await refused(429, "too_many_requests", () => relay.openRequest(IDP, "tok"))

        expect(taken).toBeInstanceOf(IdpError)
        expect(relayRefusal(taken)).toBe("taken")
        expect(relayRefusal(ended)).toBe("ended")
        expect(isTooManyRequests(limited)).toBe(true)
    })
})

describe("DeviceDirectoryApiAdapter.approveByDevice", () => {
    afterEach(() => vi.unstubAllGlobals())

    it("approves another device by this device's root key", async () => {
        const fetch = answering(204)
        const signature = new Uint8Array(64).fill(7)

        await new DeviceDirectoryApiAdapter().approveByDevice(IDP, "tok", DEVICE, signature)
        expect(await sent(fetch)).toMatchObject({
            method: "POST",
            path: `/api/keys/devices/${DEVICE}/approvals`,
            body: JSON.stringify({ by: "device", signature: bytesToBase64(signature) }),
        })
    })
})
