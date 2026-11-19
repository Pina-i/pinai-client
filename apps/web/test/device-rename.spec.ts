/**
 * Renaming a device (`identity-provider/specs/e2ee.md § 3.12`): `PUT /api/keys/devices/{id}/name`
 * as the client sends it — `null` for the automatic name back — and its refusals, told apart by
 * their code; what a draft sends, if anything, as the IdP counts and takes a name.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { DeviceDirectoryApiAdapter } from "@pinai/api/device-directory/device-directory-api.adapter"
import { cutDeviceName, deviceRename, renameRefusal } from "@pinai/domain/models/device"
import { IdpError, isApprovalRequired } from "@pinai/domain/models/idp-error"

const IDP = "http://localhost:8097/"
const DEVICE = "550e8400-e29b-41d4-a716-446655440000"

function answering(status: number, body?: unknown) {
    const sent: { method: string; path: string; body: unknown; authorization: string | null }[] = []
    vi.stubGlobal(
        "fetch",
        vi.fn(async (request: Request) => {
            sent.push({
                method: request.method,
                path: new URL(request.url).pathname,
                body: JSON.parse(await request.clone().text()),
                authorization: request.headers.get("Authorization"),
            })
            return new Response(body === undefined ? null : JSON.stringify(body), {
                status,
                headers: { "Content-Type": "application/json" },
            })
        }),
    )
    return sent
}

describe("DeviceDirectoryApiAdapter.renameDevice", () => {
    afterEach(() => vi.unstubAllGlobals())

    it("puts the name to the device's own route", async () => {
        const sent = answering(204)

        await new DeviceDirectoryApiAdapter().renameDevice(IDP, "tok", DEVICE, "Alice's laptop")

        expect(sent).toEqual([
            { method: "PUT", path: `/api/keys/devices/${DEVICE}/name`, body: { name: "Alice's laptop" }, authorization: "Bearer tok" },
        ])
    })

    it("sends null as null: the automatic name back", async () => {
        const sent = answering(204)

        await new DeviceDirectoryApiAdapter().renameDevice(IDP, "tok", DEVICE, null)

        expect(sent[0].body).toEqual({ name: null })
    })

    it.each([
        [403, "approval_required", "Only an approved device renames an approved device"],
        [403, "access_denied", "This device is revoked"],
        [404, "not_found", "No such device"],
        [400, "invalid_request", "name holds a control character"],
    ])("raises a %i %s as an IdpError, its code kept", async (status, code, description) => {
        answering(status, { error: code, error_description: description })

        const refused = await new DeviceDirectoryApiAdapter().renameDevice(IDP, "tok", DEVICE, "Alice's laptop").catch((e: unknown) => e)

        expect(refused).toBeInstanceOf(IdpError)
        expect(refused).toMatchObject({ status, code, message: description })
        expect(isApprovalRequired(refused)).toBe(code === "approval_required")
    })
})

describe("deviceRename", () => {
    const automatic = { automatic_name: "Firefox on Linux", chosen_name: null }
    const chosen = { automatic_name: "Firefox on Linux", chosen_name: "Alice's laptop" }

    it("sends the name typed, trimmed", () => {
        expect(deviceRename("  Alice's laptop ", automatic)).toEqual({ name: "Alice's laptop" })
        expect(deviceRename("Bob's old laptop", chosen)).toEqual({ name: "Bob's old laptop" })
    })

    it("sends nothing for the name it is shown by", () => {
        expect(deviceRename("Firefox on Linux", automatic)).toBeNull()
        expect(deviceRename(" Alice's laptop", chosen)).toBeNull()
    })

    it("gives the automatic name back for a blank draft or that name typed, and sends nothing when it has no other", () => {
        expect(deviceRename("", chosen)).toEqual({ name: null })
        expect(deviceRename("Firefox on Linux", chosen)).toEqual({ name: null })
        expect(deviceRename("  ", automatic)).toBeNull()
    })
})

describe("what a draft sends, as the IdP takes a name", () => {
    const automatic = { automatic_name: "Firefox on Linux", chosen_name: null }

    it("drops the control and invisible characters it refuses, keeping an emoji's joiners", () => {
        expect(deviceRename("Alice\u200B's\u0007 laptop\u202E", automatic)).toEqual({ name: "Alice's laptop" })
        expect(deviceRename("Alice's 👩\u200D💻", automatic)).toEqual({ name: "Alice's 👩\u200D💻" })
        expect(deviceRename("\u200B\u200D ", { ...automatic, chosen_name: "Alice's laptop" })).toEqual({ name: null })
    })

    it("refuses a name longer than the IdP takes, counted in characters", () => {
        const automatic = { automatic_name: "Firefox on Linux", chosen_name: null }
        expect(deviceRename("😀".repeat(50), automatic)).toEqual({ name: "😀".repeat(50) })
        expect(deviceRename("😀".repeat(51), automatic)).toEqual({ refused: "too-long" })
        expect(deviceRename(`Bob's ${"b".repeat(45)}`, automatic)).toEqual({ refused: "too-long" })
    })

    it("cuts at 50 code points, as the IdP counts, never inside an emoji", () => {
        expect(cutDeviceName("😀".repeat(60))).toBe("😀".repeat(50))
        expect(cutDeviceName("a".repeat(49) + "😀😀")).toBe("a".repeat(49) + "😀")
        expect(cutDeviceName("Alice's laptop")).toBe("Alice's laptop")
    })
})

describe("renameRefusal", () => {
    it.each([
        ["gone", new IdpError(403, "access_denied", "This device is revoked")],
        ["gone", new IdpError(404, "not_found", "No such device")],
        ["invalid", new IdpError(400, "invalid_request", "name holds a control character")],
        ["failed", new IdpError(500, "", "Internal error")],
        ["failed", new IdpError(403, "device_required", "Name this session's device first")],
        ["failed", new TypeError("Failed to fetch")],
    ])("reads %s from %s", (refusal, error) => {
        expect(renameRefusal(error)).toBe(refusal)
    })
})
