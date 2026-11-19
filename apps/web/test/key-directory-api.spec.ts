/**
 * The Delivery Service's commit and GroupInfo routes as the client calls them
 * (`identity-provider/specs/e2ee.md § 5`): a commit goes with the GroupInfo of the epoch it opens,
 * and the group's newest GroupInfo is read back, none while it has no group.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { KeyDirectoryApiAdapter } from "@pinai/api/e2ee/key-directory.adapter"
import { bytesToBase64 } from "@pinai/domain/lib/bytes"
import type { DeviceLabel } from "@pinai/domain/models/device-label"
import { IdpError } from "@pinai/domain/models/idp-error"

const IDP = "http://localhost:8097"
const CONVERSATION = "550e8400-e29b-41d4-a716-446655440000"
const COMMIT = new Uint8Array([1, 2, 3])
const GROUP_INFO = new Uint8Array([4, 5, 6])

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

function requested(fetch: ReturnType<typeof vi.fn>): [string, string] {
    const request = fetch.mock.calls[0][0] as Request
    return [request.method, new URL(request.url).pathname]
}

describe("KeyDirectoryApiAdapter — the Delivery Service", () => {
    afterEach(() => vi.unstubAllGlobals())

    it("posts a commit with the GroupInfo of the epoch it opens", async () => {
        const fetch = answering(201, {
            id: "c0ffee00-0000-0000-0000-000000000000",
            conversation_id: CONVERSATION,
            epoch: 4,
            proposer_actor_uri: "http://localhost:8097/users/alice",
            commit_blob: bytesToBase64(COMMIT),
            created_at: "2026-11-16T10:00:00Z",
        })

        const view = await new KeyDirectoryApiAdapter().postCommit(IDP, "tok", CONVERSATION, 4, COMMIT, GROUP_INFO)

        expect(requested(fetch)).toEqual(["POST", `/api/mls/groups/${CONVERSATION}/commits`])
        expect(JSON.parse(fetch.sent[0])).toEqual({
            epoch: 4,
            commit_blob: bytesToBase64(COMMIT),
            group_info: bytesToBase64(GROUP_INFO),
        })
        expect(view.commit_blob).toEqual(COMMIT)
    })

    it("reads the group's newest GroupInfo, its bytes decoded", async () => {
        const fetch = answering(200, { epoch: 4, group_info: bytesToBase64(GROUP_INFO) })

        expect(await new KeyDirectoryApiAdapter().getGroupInfo(`${IDP}/`, "tok", CONVERSATION)).toEqual({
            epoch: 4,
            group_info: GROUP_INFO,
        })
        expect(requested(fetch)).toEqual(["GET", `/api/mls/groups/${CONVERSATION}/group-info`])
    })

    it("reads none while the conversation has no group", async () => {
        answering(404, { error: "not_found", error_description: "no GroupInfo is held for this conversation" })

        expect(await new KeyDirectoryApiAdapter().getGroupInfo(IDP, "tok", CONVERSATION)).toBeNull()
    })

    it("throws any other refusal as the IdP sent it", async () => {
        answering(403, { error: "access_denied", error_description: "not a member" })

        const refused = new KeyDirectoryApiAdapter().getGroupInfo(IDP, "tok", CONVERSATION)

        await expect(refused).rejects.toBeInstanceOf(IdpError)
        await expect(refused).rejects.toMatchObject({ status: 403, code: "access_denied" })
    })
})

describe("KeyDirectoryApiAdapter — this device's label", () => {
    afterEach(() => vi.unstubAllGlobals())

    const DEVICE = "c0ffee00-0000-0000-0000-000000000001"
    const LABEL: DeviceLabel = { name: "Chrome on Pixel 8", kind: "phone", client: "browser" }
    const ATTESTED = {
        signature: bytesToBase64(new Uint8Array(64)),
        kid: "k1",
        issued_at: "2026-11-19T10:00:00Z",
        expires_at: "2027-11-19T10:00:00Z",
        signed_message: bytesToBase64(new Uint8Array([7])),
    }
    const HPKE = { publicKey: new Uint8Array(32).fill(2), signature: new Uint8Array(64).fill(3) }
    const PACKAGES = [{ key_package: new Uint8Array([9]), expires_at: "2026-12-19T10:00:00Z" }]

    it("goes with the device's registration", async () => {
        const fetch = answering(200, ATTESTED)

        await new KeyDirectoryApiAdapter(async () => LABEL).registerDevice(IDP, "tok", DEVICE, new Uint8Array(32).fill(1), HPKE)

        expect(requested(fetch)).toEqual(["POST", "/api/keys/devices"])
        expect(JSON.parse(fetch.sent[0])).toMatchObject({ device_id: DEVICE, label: LABEL })
    })

    it("goes with its KeyPackages", async () => {
        const fetch = answering(200, { uploaded: 1, available_after: 1 })

        await new KeyDirectoryApiAdapter(async () => LABEL).uploadKeyPackages(IDP, "tok", DEVICE, PACKAGES)

        expect(requested(fetch)).toEqual(["POST", "/api/keys/packages"])
        expect(JSON.parse(fetch.sent[0])).toEqual({
            device_id: DEVICE,
            packages: [{ key_package: bytesToBase64(PACKAGES[0].key_package), expires_at: PACKAGES[0].expires_at }],
            label: LABEL,
        })
    })

    it("is left out when there is none, so the IdP reads the User-Agent", async () => {
        const directory = new KeyDirectoryApiAdapter(async () => null)
        const fetch = answering(200, ATTESTED)
        await directory.registerDevice(IDP, "tok", DEVICE, new Uint8Array(32).fill(1), HPKE)
        const upload = answering(200, { uploaded: 1, available_after: 1 })
        await directory.uploadKeyPackages(IDP, "tok", DEVICE, PACKAGES)

        expect(JSON.parse(fetch.sent[0])).not.toHaveProperty("label")
        expect(JSON.parse(upload.sent[0])).not.toHaveProperty("label")
    })
})
