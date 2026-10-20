/**
 * The IdP's side of staying signed in, as `@pinai/api` speaks it: the refresh grant, a refused
 * bearer request sent once more after a renewal, and the socket reconnecting with the token of
 * the moment — or not at all, once the IdP ended its session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPError } from "ky"

import { OidcAdapter } from "@pinai/api/auth/oidc.adapter"
import { idp, retryUnauthorizedWith } from "@pinai/api/http"
import { IdpWsAdapter } from "@pinai/api/ws/idp-ws.adapter"

const IDP = "http://idp.test"
const CLIENT_ID = "https://app.example/oauth-client.json"

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function serving(...answers: Response[]) {
    const bodies: string[] = []
    const fetch = vi.fn<(request: Request) => Promise<Response>>()
    for (const answer of answers) {
        fetch.mockImplementationOnce(async (request) => {
            bodies.push(await request.clone().text())
            return answer
        })
    }
    vi.stubGlobal("fetch", fetch)
    return Object.assign(fetch, { bodies })
}

afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

describe("OidcAdapter.refresh", () => {
    const refresh = () =>
        new OidcAdapter().refresh({ tokenEndpoint: `${IDP}/token`, clientId: CLIENT_ID, refreshToken: "refresh-1" })

    it("sends the refresh grant and answers the next pair", async () => {
        const fetch = serving(json(200, { access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600 }))

        expect(await refresh()).toEqual({ accessToken: "access-2", refreshToken: "refresh-2" })
        const body = new URLSearchParams(fetch.bodies[0])
        expect(Object.fromEntries(body)).toEqual({
            grant_type: "refresh_token",
            client_id: CLIENT_ID,
            refresh_token: "refresh-1",
        })
    })

    it("answers nothing when the IdP refuses the token: the session is over", async () => {
        serving(json(400, { error: "invalid_grant", error_description: "Refresh token is invalid" }))

        expect(await refresh()).toBeNull()
    })

    it("fails, once, when the IdP fails: the token goes again only when the app says", async () => {
        const fetch = serving(json(503, {}), json(200, {}))

        await expect(refresh()).rejects.toThrow("Token refresh failed: 503")
        expect(fetch).toHaveBeenCalledTimes(1)
    })
})

describe("the IdP client's answer to a refused bearer token", () => {
    const friends = (authorization?: string) =>
        idp.get(`${IDP}/api/friends`, { headers: authorization ? { Authorization: authorization } : {} })

    beforeEach(() => retryUnauthorizedWith(async () => null))

    it("renews the session and sends the request once more, with the new token", async () => {
        const fetch = serving(json(401, { error: "invalid_token" }), json(200, ["bob"]))
        const renew = vi.fn(async () => "access-2")
        retryUnauthorizedWith(renew)

        expect(await friends("Bearer access-1").json()).toEqual(["bob"])
        expect(renew).toHaveBeenCalledTimes(1)
        expect(fetch.mock.calls[1][0].headers.get("Authorization")).toBe("Bearer access-2")
    })

    it("lets a second refusal stand", async () => {
        const fetch = serving(json(401, {}), json(401, {}))
        const renew = vi.fn(async () => "access-2")
        retryUnauthorizedWith(renew)

        await expect(friends("Bearer access-1")).rejects.toBeInstanceOf(HTTPError)
        expect(renew).toHaveBeenCalledTimes(1)
        expect(fetch).toHaveBeenCalledTimes(2)
    })

    it("leaves the refusal as it was when there is no session to renew", async () => {
        const fetch = serving(json(401, {}))

        await expect(friends("Bearer access-1")).rejects.toMatchObject({ response: { status: 401 } })
        expect(fetch).toHaveBeenCalledTimes(1)
    })

    it("never renews for a request that carried no bearer token", async () => {
        serving(json(401, {}))
        const renew = vi.fn(async () => "access-2")
        retryUnauthorizedWith(renew)

        await expect(friends()).rejects.toBeInstanceOf(HTTPError)
        expect(renew).not.toHaveBeenCalled()
    })
})

class FakeSocket {
    static opened: FakeSocket[] = []
    readonly url: string
    onopen: (() => void) | null = null
    onclose: ((event: { code: number }) => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    onerror: (() => void) | null = null

    constructor(url: string) {
        this.url = url
        FakeSocket.opened.push(this)
    }

    close(): void {}

    closedBy(code: number): void {
        this.onclose?.({ code })
    }
}

describe("IdpWsAdapter", () => {
    beforeEach(() => {
        FakeSocket.opened = []
        vi.stubGlobal("WebSocket", FakeSocket)
        vi.useFakeTimers()
    })

    it("goes with the token of the moment at each attempt: a reconnect after a renewal uses the new one", () => {
        let token = "access-1"
        const ws = new IdpWsAdapter()
        ws.connect(IDP, () => token)
        token = "access-2"

        FakeSocket.opened[0].closedBy(1006)
        vi.advanceTimersByTime(1000)

        expect(FakeSocket.opened.map((s) => s.url)).toEqual([
            "ws://idp.test/ws?token=access-1",
            "ws://idp.test/ws?token=access-2",
        ])
    })

    it("tells when the IdP closed it for an ended session, and never reopens it", () => {
        const ended = vi.fn()
        const ws = new IdpWsAdapter()
        ws.onSessionEnded(ended)
        ws.connect(IDP, () => "access-1")

        FakeSocket.opened[0].closedBy(1008)
        vi.advanceTimersByTime(60_000)

        expect(ended).toHaveBeenCalledTimes(1)
        expect(FakeSocket.opened).toHaveLength(1)
    })

    it("makes no attempt without a token", () => {
        const statuses: string[] = []
        const ws = new IdpWsAdapter()
        ws.onStatusChange((status) => statuses.push(status))
        ws.connect(IDP, () => null)

        expect(FakeSocket.opened).toHaveLength(0)
        expect(statuses).toEqual(["disconnected"])
    })
})
