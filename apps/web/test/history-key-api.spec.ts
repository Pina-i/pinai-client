/**
 * The history key's routes as the client calls them (`identity-provider/specs/e2ee.md § 5`): the
 * key read and set, uploads naming their generation, the archive cleared, a device approved by the
 * passphrase and its generation reported — and the refusals the flows tell apart, by their code.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { DeviceDirectoryApiAdapter } from "@pinai/api/device-directory/device-directory-api.adapter"
import { HistoryArchiveApiAdapter } from "@pinai/api/e2ee/history-archive-api.adapter"
import { bytesToBase64 } from "@pinai/domain/lib/bytes"
import {
    IdpError,
    isDeviceMismatch,
    isHistoryKeyConflict,
    isStaleHistoryKey,
    needsRecentSignIn,
} from "@pinai/domain/models/idp-error"

const IDP = "http://localhost:8097"
const DEVICE = "550e8400-e29b-41d4-a716-446655440000"
const SALT = new Uint8Array(16).fill(1)
const CHECK = new Uint8Array(32).fill(2)
const APPROVAL = new Uint8Array(32).fill(3)

function answering(status: number, body?: unknown) {
    const sent: string[] = []
    const fetch = vi.fn(async (request: Request) => {
        sent.push(await request.clone().text())
        return new Response(body === undefined ? null : JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
        })
    })
    vi.stubGlobal("fetch", fetch)
    return Object.assign(fetch, { sent })
}

function requested(fetch: ReturnType<typeof vi.fn>): [string, string, string | null] {
    const request = fetch.mock.calls[0][0] as Request
    return [request.method, new URL(request.url).pathname, request.headers.get("Authorization")]
}

const refusal = (error: string) => ({ error, error_description: "refused" })

describe("HistoryArchiveApiAdapter", () => {
    afterEach(() => vi.unstubAllGlobals())

    it("reads the key in force, its bytes decoded", async () => {
        const fetch = answering(200, {
            generation: 2,
            salt: bytesToBase64(SALT),
            check_value: bytesToBase64(CHECK),
            approval_public_key: bytesToBase64(APPROVAL),
            set_by_device: DEVICE,
        })

        expect(await new HistoryArchiveApiAdapter().getKey(`${IDP}/`, "tok")).toEqual({
            generation: 2,
            salt: SALT,
            checkValue: CHECK,
            approvalPublicKey: APPROVAL,
            setByDevice: DEVICE,
        })
        expect(requested(fetch)).toEqual(["GET", "/api/history/key", "Bearer tok"])
    })

    it("reads no key as null, and refuses a key whose bytes aren't their size", async () => {
        answering(404, refusal("not_found"))
        expect(await new HistoryArchiveApiAdapter().getKey(IDP, "tok")).toBeNull()

        answering(200, {
            generation: 1,
            salt: bytesToBase64(new Uint8Array(15)),
            check_value: bytesToBase64(CHECK),
            approval_public_key: bytesToBase64(APPROVAL),
            set_by_device: null,
        })
        await expect(new HistoryArchiveApiAdapter().getKey(IDP, "tok")).rejects.toThrow(/isn't one/)
    })

    it("sets a generation with its salt, check value and approval key in base64", async () => {
        const fetch = answering(204)

        await new HistoryArchiveApiAdapter().setKey(IDP, "tok", {
            generation: 1,
            salt: SALT,
            checkValue: CHECK,
            approvalPublicKey: APPROVAL,
        })

        expect(requested(fetch)).toEqual(["PUT", "/api/history/key", "Bearer tok"])
        expect(JSON.parse(fetch.sent[0])).toEqual({
            generation: 1,
            salt: bytesToBase64(SALT),
            check_value: bytesToBase64(CHECK),
            approval_public_key: bytesToBase64(APPROVAL),
        })
    })

    it("tells another device's generation, and an unnamed session, by their codes", async () => {
        const key = { generation: 1, salt: SALT, checkValue: CHECK, approvalPublicKey: APPROVAL }
        answering(409, { ...refusal("history_key_conflict"), current_generation: 1 })
        const conflict = await new HistoryArchiveApiAdapter().setKey(IDP, "tok", key).catch((e: unknown) => e)
        expect(isHistoryKeyConflict(conflict)).toBe(true)

        answering(403, refusal("device_required"))
        const unnamed = await new HistoryArchiveApiAdapter().setKey(IDP, "tok", key).catch((e: unknown) => e)
        expect(unnamed).toBeInstanceOf(IdpError)
        expect((unnamed as IdpError).code).toBe("device_required")
    })

    it("uploads entries under the generation they were sealed with, and tells a stale one", async () => {
        const fetch = answering(200, { inserted: 1 })
        const entry = { id: DEVICE, conversation_id: DEVICE, ciphertext: CHECK, nonce: new Uint8Array(12) }

        expect(await new HistoryArchiveApiAdapter().uploadBatch(IDP, "tok", 3, [entry])).toBe(1)
        expect(requested(fetch)).toEqual(["POST", "/api/history/messages", "Bearer tok"])
        expect(JSON.parse(fetch.sent[0])).toEqual({
            generation: 3,
            entries: [
                {
                    id: DEVICE,
                    conversation_id: DEVICE,
                    ciphertext: bytesToBase64(CHECK),
                    nonce: bytesToBase64(new Uint8Array(12)),
                },
            ],
        })

        answering(409, refusal("stale_history_key"))
        const stale = await new HistoryArchiveApiAdapter().uploadBatch(IDP, "tok", 3, [entry]).catch((e: unknown) => e)
        expect(isStaleHistoryKey(stale)).toBe(true)
    })

    it("clears the archive's entries, the password asked again when typed too long ago", async () => {
        const fetch = answering(200, { deleted: 4 })
        expect(await new HistoryArchiveApiAdapter().wipeArchive(IDP, "tok")).toBe(4)
        expect(requested(fetch)).toEqual(["DELETE", "/api/history/messages", "Bearer tok"])

        answering(401, refusal("insufficient_user_authentication"))
        expect(needsRecentSignIn(await new HistoryArchiveApiAdapter().wipeArchive(IDP, "tok").catch((e: unknown) => e))).toBe(true)
    })
})

describe("DeviceDirectoryApiAdapter's history key", () => {
    afterEach(() => vi.unstubAllGlobals())

    it("approves the session's device by the passphrase, the generation and signature named", async () => {
        const fetch = answering(204)
        const signature = new Uint8Array(64).fill(7)

        await new DeviceDirectoryApiAdapter().approveByPassphrase(IDP, "tok", DEVICE, 2, signature)

        expect(requested(fetch)).toEqual(["POST", `/api/keys/devices/${DEVICE}/approvals`, "Bearer tok"])
        expect(JSON.parse(fetch.sent[0])).toEqual({ by: "passphrase", generation: 2, signature: bytesToBase64(signature) })

        answering(409, refusal("stale_history_key"))
        const stale = await new DeviceDirectoryApiAdapter()
            .approveByPassphrase(IDP, "tok", DEVICE, 2, signature)
            .catch((e: unknown) => e)
        expect(isStaleHistoryKey(stale)).toBe(true)
    })

    it("reports the generation the device holds, and tells a session naming another device", async () => {
        const fetch = answering(204)

        await new DeviceDirectoryApiAdapter().reportHistoryKey(IDP, "tok", DEVICE, 2)

        expect(requested(fetch)).toEqual(["PUT", `/api/keys/devices/${DEVICE}/history-key`, "Bearer tok"])
        expect(JSON.parse(fetch.sent[0])).toEqual({ generation: 2 })

        answering(403, refusal("device_mismatch"))
        const mismatch = await new DeviceDirectoryApiAdapter()
            .reportHistoryKey(IDP, "tok", DEVICE, 2)
            .catch((e: unknown) => e)
        expect(isDeviceMismatch(mismatch)).toBe(true)
    })
})
