/**
 * A device whose storage was wiped while its session lived finds the session naming the device it
 * was (`device_mismatch`): the app ends its own session and signs in again, so the new device
 * registers from a session of its own — `identity-provider/specs/auth.md § 1`, "Sessions and
 * devices".
 */
import { describe, expect, it, vi } from "vitest"

import { IdpError, isDeviceMismatch } from "@pinai/domain/models/idp-error"
import type { AuthPlatform, HeldRefreshToken, IAuthPort } from "@pinai/domain/ports/auth.port"
import type { Renewal } from "@pinai/domain/usecases/auth/renew-session.usecase"
import { signInAgainOnDeviceMismatchUseCase } from "@pinai/domain/usecases/auth/sign-in-again.usecase"

const IDP = "https://idp.example"
const MISMATCH = new IdpError(403, "device_mismatch", "This session signed in another device")
const HELD: HeldRefreshToken = {
    refreshToken: "refresh-1",
    tokenEndpoint: `${IDP}/token`,
    clientId: "https://app.example/oauth-client.json",
    revocationEndpoint: `${IDP}/revoke`,
}

function platform(browserSession: boolean, held: HeldRefreshToken | null) {
    const calls: string[] = []
    let token = held
    const platform: AuthPlatform = {
        clientId: () => "https://app.example/oauth-client.json",
        browserSession,
        pkce: {
            generateCodeVerifier: () => "verifier",
            computeCodeChallenge: async () => "challenge",
            generateRandomString: () => "random",
        },
        session: { get: () => null, set: () => {}, remove: () => {}, clear: () => {} },
        tokens: {
            set: (next) => {
                token = next
            },
            take: () => {
                const taken = token
                token = null
                return taken
            },
            clear: () => void calls.push("clear tokens"),
        },
        navigation: {
            callbackUrl: () => "https://app.example/callback",
            postLogoutUrl: () => "https://app.example/",
            currentLocation: () => "/",
            navigateTo: (url) => void calls.push(`go ${new URL(url, "https://app.example").pathname}`),
        },
        appearance: () => null,
    }
    return { platform, calls }
}

function authPort(calls: string[], revoke: () => Promise<void> = async () => {}) {
    return {
        discoverConfig: vi.fn(async () => ({
            issuer: IDP,
            authorization_endpoint: `${IDP}/authorize`,
            token_endpoint: `${IDP}/token`,
            userinfo_endpoint: `${IDP}/userinfo`,
            revocation_endpoint: `${IDP}/revoke`,
        })),
        revoke: vi.fn(async (_params: unknown) => {
            calls.push("revoke")
            await revoke()
        }),
    } as unknown as IAuthPort & { revoke: ReturnType<typeof vi.fn> }
}

describe("isDeviceMismatch", () => {
    it("is the IdP's code, not its words", () => {
        expect(isDeviceMismatch(MISMATCH)).toBe(true)
        expect(isDeviceMismatch(new IdpError(403, "access_denied", "device_mismatch"))).toBe(false)
        expect(isDeviceMismatch(new Error("device_mismatch"))).toBe(false)
    })
})

/** A renewal that puts `next` back once it answers, as one under way does. */
function renewal(web: AuthPlatform, next: HeldRefreshToken | null) {
    return vi.fn(async (): Promise<Renewal> => {
        if (!next) return { kind: "ended" }
        web.tokens.set(next)
        return { kind: "renewed", accessToken: "access-2" }
    })
}

const noRenewal = () => vi.fn(async (): Promise<Renewal> => ({ kind: "ended" }))

describe("signInAgainOnDeviceMismatchUseCase", () => {
    it("on the web, revokes the app's own session and signs in again at once", async () => {
        const { platform: web, calls } = platform(true, HELD)
        const port = authPort(calls)
        const renew = noRenewal()

        const signedIn = await signInAgainOnDeviceMismatchUseCase(port, web, renew)(MISMATCH, IDP, () =>
            calls.push("clear session"),
        )

        expect(signedIn).toBe(true)
        expect(renew).not.toHaveBeenCalled()
        expect(port.revoke).toHaveBeenCalledWith({
            revocationEndpoint: `${IDP}/revoke`,
            clientId: HELD.clientId,
            refreshToken: "refresh-1",
        })
        expect(calls).toEqual(["clear session", "clear tokens", "revoke", "go /authorize"])
    })

    it("on the web, waits for the renewal holding the token and revokes its successor", async () => {
        const { platform: web, calls } = platform(true, null)
        const port = authPort(calls)
        const renew = renewal(web, { ...HELD, refreshToken: "refresh-2" })

        await signInAgainOnDeviceMismatchUseCase(port, web, renew)(MISMATCH, IDP, () => calls.push("clear session"))

        expect(renew).toHaveBeenCalledOnce()
        expect(port.revoke).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: "refresh-2" }))
        expect(calls).toEqual(["clear session", "clear tokens", "revoke", "go /authorize"])
    })

    it("on the web, holding no token even then, signs in all the same, never through the IdP's logout", async () => {
        const { platform: web, calls } = platform(true, null)
        const port = authPort(calls)

        await signInAgainOnDeviceMismatchUseCase(port, web, renewal(web, null))(MISMATCH, IDP, () =>
            calls.push("clear session"),
        )

        expect(port.revoke).not.toHaveBeenCalled()
        expect(calls).toEqual(["clear session", "clear tokens", "go /authorize"])
    })

    it("on the web, a token the IdP names no revocation endpoint for is not revoked, and it signs in", async () => {
        const { platform: web, calls } = platform(true, { ...HELD, revocationEndpoint: null })
        const port = authPort(calls)

        await signInAgainOnDeviceMismatchUseCase(port, web, noRenewal())(MISMATCH, IDP, () =>
            calls.push("clear session"),
        )

        expect(port.revoke).not.toHaveBeenCalled()
        expect(calls).toEqual(["clear session", "clear tokens", "go /authorize"])
    })

    it("on the web, an IdP that fails the revocation leaves the landing to sign in again by hand", async () => {
        const { platform: web, calls } = platform(true, HELD)
        const port = authPort(calls, async () => Promise.reject(new Error("Token revocation failed: 502")))

        expect(
            await signInAgainOnDeviceMismatchUseCase(port, web, noRenewal())(MISMATCH, IDP, () =>
                calls.push("clear session"),
            ),
        ).toBe(true)

        expect(calls).toEqual(["clear session", "clear tokens", "revoke", "go /"])
    })

    it("on the desktop, clears the token, which revokes it, and opens a sign-in at once", async () => {
        const { platform: desktop, calls } = platform(false, null)
        const port = authPort(calls)
        const renew = noRenewal()

        await signInAgainOnDeviceMismatchUseCase(port, desktop, renew)(MISMATCH, IDP, () => calls.push("clear session"))

        expect(renew).not.toHaveBeenCalled()
        expect(port.revoke).not.toHaveBeenCalled()
        expect(calls).toEqual(["clear session", "clear tokens", "go /authorize"])
    })

    it("signs in again once a page: a second refusal meanwhile joins the first", async () => {
        const { platform: web, calls } = platform(true, HELD)
        const port = authPort(calls)
        const signInAgain = signInAgainOnDeviceMismatchUseCase(port, web, noRenewal())

        const [first, second] = await Promise.all([
            signInAgain(MISMATCH, IDP, () => calls.push("clear session")),
            signInAgain(MISMATCH, IDP, () => calls.push("clear session")),
        ])

        expect([first, second]).toEqual([true, true])
        expect(calls).toEqual(["clear session", "clear tokens", "revoke", "go /authorize"])
    })

    it("leaves any other refusal to its caller", async () => {
        const { platform: web, calls } = platform(true, HELD)
        const signInAgain = signInAgainOnDeviceMismatchUseCase(authPort(calls), web, noRenewal())

        const revoked = new IdpError(403, "access_denied", "Device is revoked")
        expect(await signInAgain(revoked, IDP, () => calls.push("clear"))).toBe(false)
        expect(await signInAgain(MISMATCH, null, () => calls.push("clear"))).toBe(false)
        expect(calls).toEqual([])
    })
})
