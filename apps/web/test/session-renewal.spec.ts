/**
 * Staying signed in: when an access token is renewed, and how a renewal goes — the refresh token
 * rotated, kept when the IdP couldn't be reached, gone when the session is over, and never
 * presented twice at once.
 */
import { describe, expect, it, vi } from "vitest"

import { renewAfter } from "@pinai/domain/models/auth"
import type { HeldRefreshToken, IAuthPort, ISessionTokenStore } from "@pinai/domain/ports/auth.port"
import { renewSessionUseCase } from "@pinai/domain/usecases/auth/renew-session.usecase"

const CLIENT_ID = "https://app.example/oauth-client.json"
const TOKEN_ENDPOINT = "https://idp.example/token"

function jwt(claims: object): string {
    const payload = btoa(JSON.stringify(claims)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    return `eyJhbGciOiJFZERTQSJ9.${payload}.signature`
}

describe("renewAfter", () => {
    it("is 80 % of the token's lifetime: 48 minutes of an hour", () => {
        expect(renewAfter(jwt({ iat: 1_790_000_000, exp: 1_790_003_600 }))).toBe(48 * 60 * 1000)
    })

    it("reads the lifetime alone, so a device whose clock is hours off renews on time all the same", () => {
        expect(renewAfter(jwt({ iat: 100, exp: 3_700 }))).toBe(48 * 60 * 1000)
    })

    it("is nothing for a token whose lifetime can't be read", () => {
        for (const token of ["not-a-jwt", jwt({ exp: 1_790_003_600 }), jwt({ iat: 5, exp: 5 })]) {
            expect(renewAfter(token), token).toBeNull()
        }
    })
})

function holding(initial: HeldRefreshToken | null) {
    let held = initial
    const tokens: ISessionTokenStore = {
        set: (next) => void (held = next),
        take: () => {
            const taken = held
            held = null
            return taken
        },
        clear: () => void (held = null),
    }
    return { tokens, held: () => held }
}

function answering(refresh: IAuthPort["refresh"]) {
    const spy = vi.fn(refresh)
    const port: IAuthPort = {
        discoverConfig: vi.fn(),
        exchangeCode: vi.fn(),
        fetchUserInfo: vi.fn(),
        refresh: spy,
        revoke: vi.fn(),
    }
    return { port, refresh: spy }
}

const FIRST: HeldRefreshToken = {
    refreshToken: "refresh-1",
    tokenEndpoint: TOKEN_ENDPOINT,
    clientId: CLIENT_ID,
    revocationEndpoint: null,
}

describe("renewSessionUseCase", () => {
    it("trades the refresh token, as its own client, for the next pair, and keeps the next refresh token", async () => {
        const { tokens, held } = holding(FIRST)
        const { port, refresh } = answering(async () => ({ accessToken: "access-2", refreshToken: "refresh-2" }))

        const renewal = await renewSessionUseCase(port, tokens)()

        expect(renewal).toEqual({ kind: "renewed", accessToken: "access-2" })
        expect(refresh).toHaveBeenCalledWith({ tokenEndpoint: TOKEN_ENDPOINT, clientId: CLIENT_ID, refreshToken: "refresh-1" })
        expect(held()).toEqual({ ...FIRST, refreshToken: "refresh-2" })
    })

    it("ends the session when the IdP refuses the token, keeping nothing", async () => {
        const { tokens, held } = holding(FIRST)
        const { port } = answering(async () => null)

        expect(await renewSessionUseCase(port, tokens)()).toEqual({ kind: "ended" })
        expect(held()).toBeNull()
    })

    it("ends when no refresh token is held, without asking the IdP", async () => {
        const { tokens } = holding(null)
        const { port, refresh } = answering(async () => null)

        expect(await renewSessionUseCase(port, tokens)()).toEqual({ kind: "ended" })
        expect(refresh).not.toHaveBeenCalled()
    })

    it("keeps the token when the IdP can't be reached: a lost answer is given again within the minute", async () => {
        const { tokens, held } = holding(FIRST)
        const { port } = answering(async () => {
            throw new TypeError("Failed to fetch")
        })

        expect(await renewSessionUseCase(port, tokens)()).toEqual({ kind: "unreachable" })
        expect(held()).toEqual(FIRST)
    })

    it("runs one renewal for everyone asking at once, then a fresh one for whoever asks next", async () => {
        const { tokens } = holding(FIRST)
        let answer: (tokens: { accessToken: string; refreshToken: string }) => void = () => {}
        const { port, refresh } = answering(
            () =>
                new Promise((resolve) => {
                    answer = resolve
                }),
        )
        const renew = renewSessionUseCase(port, tokens)

        const timer = renew()
        const refused = renew()
        const socket = renew()
        answer({ accessToken: "access-2", refreshToken: "refresh-2" })

        const outcomes = await Promise.all([timer, refused, socket])
        expect(refresh).toHaveBeenCalledTimes(1)
        expect(new Set(outcomes.map((o) => JSON.stringify(o))).size).toBe(1)

        const later = renew()
        answer({ accessToken: "access-3", refreshToken: "refresh-3" })
        expect(await later).toEqual({ kind: "renewed", accessToken: "access-3" })
        expect(refresh).toHaveBeenCalledTimes(2)
        expect(refresh.mock.calls[1][0].refreshToken).toBe("refresh-2")
    })
})
