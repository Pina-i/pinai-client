/**
 * Staying signed in: when an access token is renewed, and how a renewal goes — the refresh token
 * rotated, kept when the IdP couldn't be reached, gone when the session is over, and never
 * presented twice at once.
 */
import { describe, expect, it, vi } from "vitest"

import { renewAfter } from "@pinai/domain/models/auth"
import type { HeldRefreshToken, IAuthPort, ISessionTokenStore } from "@pinai/domain/ports/auth.port"
import { RENEWAL_RETRY_MS, SessionKeeper } from "@pinai/domain/usecases/auth/keep-session.usecase"
import { type Renewal, renewSessionUseCase } from "@pinai/domain/usecases/auth/renew-session.usecase"

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

describe("SessionKeeper", () => {
    const HOUR_TOKEN = jwt({ iat: 1_790_000_000, exp: 1_790_003_600 })
    const NEXT_TOKEN = jwt({ iat: 1_790_002_880, exp: 1_790_006_480 })
    const MINUTE = 60_000

    function keeping(answers: Renewal[]) {
        let now = 0
        let who: string | null = "alice"
        const renew = vi.fn(async () => answers.shift() ?? { kind: "ended" as const })
        const renewed = vi.fn()
        const ended = vi.fn()
        const keeper = new SessionKeeper({ renew, signedIn: () => who, renewed, ended, now: () => now })
        return {
            keeper,
            renew,
            renewed,
            ended,
            at: (ms: number) => void (now = ms),
            signIn: (actor: string | null) => void (who = actor),
        }
    }

    it("renews a token at 80 % of its life, counted from its arrival, and not before", async () => {
        const { keeper, renew, at } = keeping([{ kind: "renewed", accessToken: NEXT_TOKEN }])
        at(5 * MINUTE)
        keeper.track(HOUR_TOKEN)

        at(5 * MINUTE + 48 * MINUTE - 1)
        keeper.renewIfDue()
        expect(renew).not.toHaveBeenCalled()

        at(5 * MINUTE + 48 * MINUTE)
        keeper.renewIfDue()
        expect(renew).toHaveBeenCalledTimes(1)
    })

    it("keeps the schedule of a token it is shown again", () => {
        const { keeper, renew, at } = keeping([])
        keeper.track(HOUR_TOKEN)
        at(30 * MINUTE)
        keeper.track(HOUR_TOKEN)

        at(48 * MINUTE)
        keeper.renewIfDue()
        expect(renew).toHaveBeenCalledTimes(1)
    })

    it("hands the renewed token on and schedules it from its own arrival", async () => {
        const { keeper, renew, renewed, at } = keeping([{ kind: "renewed", accessToken: NEXT_TOKEN }])
        keeper.track(HOUR_TOKEN)
        at(48 * MINUTE)

        expect(await keeper.renewNow()).toBe(NEXT_TOKEN)
        expect(renewed).toHaveBeenCalledWith(NEXT_TOKEN)
        expect(keeper.arrivalOf(NEXT_TOKEN)).toBe(48 * MINUTE)

        at(48 * MINUTE + 48 * MINUTE - 1)
        keeper.renewIfDue()
        expect(renew).toHaveBeenCalledTimes(1)
    })

    it("tries again 15 seconds after the IdP couldn't be reached, within its minute of grace", async () => {
        const { keeper, renew, at } = keeping([{ kind: "unreachable" }, { kind: "unreachable" }])
        keeper.track(HOUR_TOKEN)
        at(48 * MINUTE)
        expect(await keeper.renewNow()).toBeNull()

        at(48 * MINUTE + RENEWAL_RETRY_MS - 1)
        keeper.renewIfDue()
        expect(renew).toHaveBeenCalledTimes(1)
        at(48 * MINUTE + RENEWAL_RETRY_MS)
        keeper.renewIfDue()
        expect(renew).toHaveBeenCalledTimes(2)
    })

    it("ends the session once, asks nothing more, and starts again with the next sign-in's token", async () => {
        const { keeper, renew, ended, at } = keeping([{ kind: "ended" }, { kind: "renewed", accessToken: NEXT_TOKEN }])
        keeper.track(HOUR_TOKEN)

        expect(await keeper.renewNow()).toBeNull()
        expect(await keeper.renewNow()).toBeNull()
        expect(ended).toHaveBeenCalledTimes(1)
        expect(renew).toHaveBeenCalledTimes(1)

        at(MINUTE)
        keeper.track(NEXT_TOKEN)
        expect(await keeper.renewNow()).toBe(NEXT_TOKEN)
    })

    it("drops an answer that arrives once someone else is signed in, or nobody", async () => {
        for (const next of ["bob", null]) {
            let who: string | null = "alice"
            let answer: (renewal: Renewal) => void = () => {}
            const renewed = vi.fn()
            const ended = vi.fn()
            const keeper = new SessionKeeper({
                renew: () => new Promise<Renewal>((resolve) => (answer = resolve)),
                signedIn: () => who,
                renewed,
                ended,
            })
            keeper.track(HOUR_TOKEN)

            const renewal = keeper.renewNow()
            who = next
            answer({ kind: "ended" })

            expect(await renewal).toBeNull()
            expect(renewed).not.toHaveBeenCalled()
            expect(ended).not.toHaveBeenCalled()
        }
    })

    it("asks nothing while nobody is signed in", async () => {
        const { keeper, renew, signIn } = keeping([])
        signIn(null)

        expect(await keeper.renewNow()).toBeNull()
        expect(renew).not.toHaveBeenCalled()
    })

    it("knows when the token it tracks arrived, and only that one", () => {
        const { keeper, at } = keeping([])
        at(7_000)
        keeper.track(HOUR_TOKEN)

        expect(keeper.arrivalOf(HOUR_TOKEN)).toBe(7_000)
        expect(keeper.arrivalOf(NEXT_TOKEN)).toBeNull()
        expect(keeper.arrivalOf(null)).toBeNull()
    })
})
