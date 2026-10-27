/**
 * The IdP's admin API as the client calls it: each route's method and path, an id put in the path
 * safely, the bearer token, and refusals the screen tells apart — a member's 403, the password
 * asked again before a reset link.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { InstanceAdminApiAdapter } from "@pinai/api/admin/instance-admin-api.adapter"
import { needsRecentSignIn } from "@pinai/domain/models/idp-error"
import { refusedAsNonAdmin } from "@pinai/domain/models/instance-admin"

const IDP = "http://localhost:8097"

function answering(status: number, body?: unknown, headers: Record<string, string> = {}) {
    const fetch = vi.fn().mockResolvedValue(
        new Response(body === undefined ? null : JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json", ...headers },
        }),
    )
    vi.stubGlobal("fetch", fetch)
    return fetch
}

function requested(fetch: ReturnType<typeof vi.fn>): Request {
    return fetch.mock.calls[0][0] as Request
}

describe("InstanceAdminApiAdapter", () => {
    afterEach(() => vi.unstubAllGlobals())

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
