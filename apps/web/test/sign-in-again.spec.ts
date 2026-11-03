/**
 * A device whose storage was wiped while its session lived finds the session naming the device it
 * was (`device_mismatch`): it signs out and in again, so the new device registers from a session
 * of its own — `identity-provider/specs/auth.md § 1`, "Sessions and devices".
 */
import { describe, expect, it, vi } from "vitest"

import { IdpError, isDeviceMismatch } from "@pinai/domain/models/idp-error"
import type { AuthPlatform, AuthSessionKey, IAuthPort } from "@pinai/domain/ports/auth.port"
import {
    signInAgainOnDeviceMismatchUseCase,
    signInAgainUseCase,
} from "@pinai/domain/usecases/auth/sign-in-again.usecase"

const IDP = "https://idp.example"
const MISMATCH = new IdpError(403, "device_mismatch", "This session signed in another device")

function platform(browserSession: boolean) {
    const calls: string[] = []
    const scratch = new Map<AuthSessionKey, string>()
    const platform: AuthPlatform = {
        clientId: () => "https://app.example/oauth-client.json",
        browserSession,
        pkce: {
            generateCodeVerifier: () => "verifier",
            computeCodeChallenge: async () => "challenge",
            generateRandomString: () => "random",
        },
        session: {
            get: (key) => scratch.get(key) ?? null,
            set: (key, value) => void scratch.set(key, value),
            remove: (key) => void scratch.delete(key),
            clear: () => scratch.clear(),
        },
        tokens: { set: () => {}, take: () => null, clear: () => void calls.push("clear tokens") },
        navigation: {
            callbackUrl: () => "https://app.example/callback",
            postLogoutUrl: () => "https://app.example/",
            currentLocation: () => "/",
            navigateTo: (url) => void calls.push(`go ${new URL(url, "https://app.example").pathname}`),
        },
        appearance: () => null,
    }
    return { platform, calls, scratch }
}

const authPort = {
    discoverConfig: vi.fn(async () => ({
        issuer: IDP,
        authorization_endpoint: `${IDP}/authorize`,
        token_endpoint: `${IDP}/token`,
        userinfo_endpoint: `${IDP}/userinfo`,
    })),
} as unknown as IAuthPort

describe("isDeviceMismatch", () => {
    it("is the IdP's code, not its words", () => {
        expect(isDeviceMismatch(MISMATCH)).toBe(true)
        expect(isDeviceMismatch(new IdpError(403, "access_denied", "device_mismatch"))).toBe(false)
        expect(isDeviceMismatch(new Error("device_mismatch"))).toBe(false)
    })
})

describe("signInAgainOnDeviceMismatchUseCase", () => {
    it("on the web, ends the browser session at the IdP and asks for a sign-in once it is back", async () => {
        const { platform: web, calls, scratch } = platform(true)

        const signedOut = await signInAgainOnDeviceMismatchUseCase(MISMATCH, IDP, () => calls.push("clear session"), authPort, web)

        expect(signedOut).toBe(true)
        expect(calls).toEqual(["clear session", "clear tokens", "go /logout"])
        expect(scratch.get("sign_in_again")).toBe(IDP)
    })

    it("on the desktop, ends the app session and opens a sign-in at once", async () => {
        const { platform: desktop, calls, scratch } = platform(false)

        await signInAgainOnDeviceMismatchUseCase(MISMATCH, IDP, () => calls.push("clear session"), authPort, desktop)

        expect(calls).toEqual(["clear session", "clear tokens", "go /authorize"])
        expect(scratch.has("sign_in_again")).toBe(false)
    })

    it("leaves any other refusal to its caller", async () => {
        const { platform: web, calls } = platform(true)

        const revoked = new IdpError(403, "access_denied", "Device is revoked")
        expect(await signInAgainOnDeviceMismatchUseCase(revoked, IDP, () => calls.push("clear"), authPort, web)).toBe(false)
        expect(await signInAgainOnDeviceMismatchUseCase(MISMATCH, null, () => calls.push("clear"), authPort, web)).toBe(false)
        expect(calls).toEqual([])
    })
})

describe("signInAgainUseCase", () => {
    it("signs in once the logout a device mismatch asked for is back, and only once", async () => {
        const { platform: web, calls, scratch } = platform(true)
        scratch.set("sign_in_again", IDP)

        expect(await signInAgainUseCase(authPort, web)).toBe(true)
        expect(await signInAgainUseCase(authPort, web)).toBe(false)

        expect(calls).toEqual(["go /authorize"])
    })

    it("does nothing on an ordinary visit to the landing", async () => {
        const { platform: web, calls } = platform(true)

        expect(await signInAgainUseCase(authPort, web)).toBe(false)
        expect(calls).toEqual([])
    })
})
