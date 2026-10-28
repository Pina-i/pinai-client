/**
 * The IdP's admin API as the client calls it: each route's method and path, an id put in the path
 * safely, the bearer token, the name and description sent with both keys, and refusals the screen
 * tells apart — a member's 403, a field past its limit, the password asked again before a reset
 * link.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { InstanceAdminApiAdapter } from "@pinai/api/admin/instance-admin-api.adapter"
import { IdpError, needsRecentSignIn } from "@pinai/domain/models/idp-error"
import { refusedAsNonAdmin } from "@pinai/domain/models/instance-admin"

const IDP = "http://localhost:8097"

function answering(status: number, body?: unknown, headers: Record<string, string> = {}) {
    const sent: string[] = []
    const fetch = vi.fn(async (request: Request) => {
        // Read here: ky has used the body up by the time the call returns.
        sent.push(await request.clone().text())
        return new Response(body === undefined ? null : JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json", ...headers },
        })
    })
    vi.stubGlobal("fetch", fetch)
    return Object.assign(fetch, { sent })
}

function requested(fetch: ReturnType<typeof vi.fn>): Request {
    return fetch.mock.calls[0][0] as Request
}

describe("InstanceAdminApiAdapter", () => {
    afterEach(() => vi.unstubAllGlobals())

    it("reads the name and description with the admin's token, null for a default", async () => {
        const fetch = answering(200, { name: null, description: "Where the long white cloud gathers." })

        expect(await new InstanceAdminApiAdapter().getIntro(`${IDP}/`, "tok")).toEqual({
            name: null,
            description: "Where the long white cloud gathers.",
        })
        const request = requested(fetch)
        expect([request.method, new URL(request.url).pathname]).toEqual(["GET", "/api/admin/intro"])
        expect(request.headers.get("Authorization")).toBe("Bearer tok")
    })

    it("saves both fields as one JSON text, a default sent as null, and reads the text saved", async () => {
        const fetch = answering(200, { name: "Aotearoa", description: null })

        expect(
            await new InstanceAdminApiAdapter().saveIntro(IDP, "tok", { name: "Aotearoa", description: null }),
        ).toEqual({ name: "Aotearoa", description: null })
        const request = requested(fetch)
        expect([request.method, new URL(request.url).pathname]).toEqual(["PUT", "/api/admin/intro"])
        expect(request.headers.get("Authorization")).toBe("Bearer tok")
        expect(request.headers.get("Content-Type")).toBe("application/json")
        expect(fetch.sent.map((text) => JSON.parse(text))).toEqual([{ name: "Aotearoa", description: null }])
    })

    it("passes on the rule a save broke, in the IdP's words", async () => {
        answering(400, { error: "invalid_request", error_description: "instance name: 40 characters at most" })

        const refusal = new InstanceAdminApiAdapter().saveIntro(IDP, "tok", { name: "ō".repeat(41), description: null })
        await expect(refusal).rejects.toBeInstanceOf(IdpError)
        await expect(refusal).rejects.toMatchObject({
            status: 400,
            code: "invalid_request",
            message: "instance name: 40 characters at most",
        })
    })

    it("refuses a member's save as no admin (403)", async () => {
        answering(403, { error: "access_denied", error_description: "Only an admin may do this" })

        await expect(
            new InstanceAdminApiAdapter().saveIntro(IDP, "tok", { name: null, description: null }),
        ).rejects.toSatisfy(refusedAsNonAdmin)
    })

    it("lists the members with the admin's token", async () => {
        const members = [{ id: "m1", display_name: "Mika", admin: false, last_active_at: null, online: false }]
        const fetch = answering(200, members)

        expect(await new InstanceAdminApiAdapter().listMembers(`${IDP}/`, "tok")).toEqual(members)
        const request = requested(fetch)
        expect([request.method, new URL(request.url).pathname]).toEqual(["GET", "/api/admin/members"])
        expect(request.headers.get("Authorization")).toBe("Bearer tok")
    })

    it("lists the open invitations", async () => {
        const fetch = answering(200, [])

        expect(await new InstanceAdminApiAdapter().listInvitations(IDP, "tok")).toEqual([])
        expect([requested(fetch).method, new URL(requested(fetch).url).pathname]).toEqual(["GET", "/api/admin/invitations"])
    })

    it("makes an invitation with no body, and reads its one-time link", async () => {
        const made = { id: "i1", link: `${IDP}/i/TOKEN`, expires_at: "2026-11-03T12:00:00Z" }
        const fetch = answering(201, made)

        expect(await new InstanceAdminApiAdapter().createInvitation(IDP, "tok")).toEqual(made)
        const request = requested(fetch)
        expect([request.method, new URL(request.url).pathname]).toEqual(["POST", "/api/admin/invitations"])
        expect(await request.text()).toBe("")
    })

    it("revokes by id, the id kept inside its path segment, and takes the 204", async () => {
        const fetch = answering(204)

        await new InstanceAdminApiAdapter().revokeInvitation(IDP, "tok", "a/../b?c")
        const request = requested(fetch)
        expect(request.method).toBe("DELETE")
        expect(new URL(request.url).pathname).toBe("/api/admin/invitations/a%2F..%2Fb%3Fc")
    })

    it("asks a member's reset link by their id", async () => {
        const issued = { link: `${IDP}/r/TOKEN`, expires_at: "2026-10-28T12:00:00Z" }
        const fetch = answering(201, issued)

        expect(await new InstanceAdminApiAdapter().issuePasswordReset(IDP, "tok", "m 1")).toEqual(issued)
        const request = requested(fetch)
        expect([request.method, new URL(request.url).pathname]).toEqual(["POST", "/api/admin/members/m%201/password-reset"])
    })

    it("refuses a member as no admin (403)", async () => {
        answering(403, { error: "access_denied", error_description: "Only an admin may do this" })

        await expect(new InstanceAdminApiAdapter().listMembers(IDP, "tok")).rejects.toSatisfy(refusedAsNonAdmin)
    })

    it("asks the password again before a reset link, without renewing the session", async () => {
        const fetch = answering(
            401,
            { error: "insufficient_user_authentication", error_description: "Sign in again" },
            { "WWW-Authenticate": 'Bearer error="insufficient_user_authentication", max_age=600' },
        )

        await expect(new InstanceAdminApiAdapter().issuePasswordReset(IDP, "tok", "m1")).rejects.toSatisfy(needsRecentSignIn)
        expect(fetch).toHaveBeenCalledOnce()
    })
})
