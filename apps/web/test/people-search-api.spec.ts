/**
 * Finding people as the client calls the IdP: the routes, the bearer token, the query and the
 * address URL-encoded, and the lookup's answers read as found, not found or unreachable.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { SocialApiAdapter } from "@pinai/api/social/social-api.adapter"
import { IdpError } from "@pinai/domain/models/idp-error"
import type { PeopleFound, Person } from "@pinai/domain/models/people-search"

const IDP = "http://localhost:8080"

const mahealani: Person = {
    actor_uri: "https://reef.chat/users/mahealani_q1x8c",
    address: "mahealani_q1x8c@reef.chat",
    display_name: "Mahealani",
    avatar_url: null,
    relation: "request_received",
    friendship_id: "7b1e0c9a-5b0e-4a8e-9a43-1f5c2f8f6d10",
}

function answering(status: number, body?: unknown) {
    const fetch = vi.fn(
        async () =>
            new Response(body === undefined ? null : JSON.stringify(body), {
                status,
                headers: { "Content-Type": "application/json" },
            }),
    )
    vi.stubGlobal("fetch", fetch)
    return fetch
}

function requested(fetch: ReturnType<typeof vi.fn>): Request {
    return fetch.mock.calls[0][0] as Request
}

describe("SocialApiAdapter.searchPeople", () => {
    afterEach(() => vi.unstubAllGlobals())

    it("asks GET /api/users/search with the bearer token, and reads both sections", async () => {
        const found: PeopleFound = {
            server: [{ ...mahealani, actor_uri: "http://localhost:8080/users/hoku_xk9mp", address: "hoku_xk9mp@localhost:8080" }],
            groups: [{ ...mahealani, group: "MLS working group" }],
        }
        const fetch = answering(200, found)

        expect(await new SocialApiAdapter().searchPeople(`${IDP}/`, "tok", "hoku")).toEqual(found)
        const request = requested(fetch)
        expect([request.method, new URL(request.url).pathname]).toEqual(["GET", "/api/users/search"])
        expect(request.headers.get("Authorization")).toBe("Bearer tok")
        expect(fetch).toHaveBeenCalledOnce()
    })

    it("sends the query URL-encoded", async () => {
        const fetch = answering(200, { server: [], groups: [] })

        await new SocialApiAdapter().searchPeople(IDP, "tok", "H\u014dk\u016b & co #1?")
        const url = new URL(requested(fetch).url)
        expect(url.search).toBe("?q=H%C5%8Dk%C5%AB+%26+co+%231%3F")
        expect([...url.searchParams]).toEqual([["q", "H\u014dk\u016b & co #1?"]])
    })

    it("passes a refusal on as the IdP's error", async () => {
        answering(400, { error: "invalid_request", error_description: "q: at least 2 characters besides combining marks" })

        const refusal = new SocialApiAdapter().searchPeople(IDP, "tok", "a")
        await expect(refusal).rejects.toBeInstanceOf(IdpError)
        await expect(refusal).rejects.toMatchObject({ status: 400, code: "invalid_request" })
    })
})

describe("SocialApiAdapter.lookupAddress", () => {
    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("asks GET /api/users/lookup with the address URL-encoded, and reads the person found", async () => {
        const fetch = answering(200, mahealani)

        expect(await new SocialApiAdapter().lookupAddress(`${IDP}/`, "tok", "mahealani_q1x8c@reef.chat")).toEqual({
            kind: "found",
            person: mahealani,
        })
        const request = requested(fetch)
        const url = new URL(request.url)
        expect([request.method, url.pathname]).toEqual(["GET", "/api/users/lookup"])
        expect(url.search).toBe("?address=mahealani_q1x8c%40reef.chat")
        expect(request.headers.get("Authorization")).toBe("Bearer tok")
    })

    it("reads a 404 as no account at the address", async () => {
        answering(404, { error: "not_found", error_description: "No account at this address" })

        expect(await new SocialApiAdapter().lookupAddress(IDP, "tok", "kai_zzzzz@moana.social")).toEqual({
            kind: "not-found",
        })
    })

    it("reads a 400 as no account either: none can be at an address the IdP can't read", async () => {
        answering(400, { error: "invalid_request", error_description: "address: user@domain" })

        expect(await new SocialApiAdapter().lookupAddress(IDP, "tok", "kai moana@moana.social")).toEqual({
            kind: "not-found",
        })
    })

    it("reads a 502 as the other instance out of reach, asked once", async () => {
        const fetch = answering(502, { error: "bad_gateway", error_description: "moana.social didn't answer" })

        expect(await new SocialApiAdapter().lookupAddress(IDP, "tok", "kai_ab3xz@moana.social")).toEqual({
            kind: "unreachable",
        })
        expect(fetch).toHaveBeenCalledOnce()
    })

    it("waits 15 s for the IdP, which gives the other instance up to 10 s before its 502", async () => {
        vi.useFakeTimers()
        vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})))
        const settled = vi.fn()

        const lookup = new SocialApiAdapter().lookupAddress(IDP, "tok", "kai_ab3xz@moana.social")
        lookup.then(settled, settled)
        await vi.advanceTimersByTimeAsync(14_999)
        expect(settled).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(1)
        await expect(lookup).rejects.toMatchObject({ name: "TimeoutError" })
    })

    it("throws any other refusal as the IdP's error, asked once", async () => {
        for (const status of [403, 429, 500, 503]) {
            const fetch = answering(status, { error: "server_error", error_description: "Something went wrong" })

            const refusal = new SocialApiAdapter().lookupAddress(IDP, "tok", "kai_ab3xz@moana.social")
            await expect(refusal).rejects.toBeInstanceOf(IdpError)
            await expect(refusal).rejects.toMatchObject({ status })
            expect(fetch).toHaveBeenCalledOnce()
            vi.unstubAllGlobals()
        }
    })

    it("throws when the IdP can't be reached at all", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))

        await expect(new SocialApiAdapter().lookupAddress(IDP, "tok", "kai_ab3xz@moana.social")).rejects.toThrow(
            "Failed to fetch",
        )
    })
})
