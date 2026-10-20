import { describe, expect, it, vi } from "vitest"

import type { AuthPlatform } from "@pinai/domain/ports/auth.port"
import { logoutUseCase } from "@pinai/domain/usecases/auth/logout.usecase"

const CLIENT_ID = "https://app.example/oauth-client.json"

function platform(
    navigateTo: (url: string) => void,
    clearTokens: () => void = () => {},
    browserSession = true,
): AuthPlatform {
    return {
        clientId: () => CLIENT_ID,
        browserSession,
        pkce: {
            generateCodeVerifier: () => "",
            computeCodeChallenge: async () => "",
            generateRandomString: () => "",
        },
        session: { get: () => null, set: () => {}, remove: () => {}, clear: () => {} },
        tokens: { set: () => {}, take: () => null, clear: clearTokens },
        navigation: {
            callbackUrl: () => "https://app.example/callback",
            postLogoutUrl: () => "https://app.example/",
            currentLocation: () => "/home",
            navigateTo,
        },
        appearance: () => null,
    }
}

describe("logoutUseCase", () => {
    it("clears the session and its refresh token, then sends the browser to the IdP naming this client and where to come back", () => {
        const calls: string[] = []
        const navigateTo = vi.fn((url: string) => void calls.push(url))
        const clearSession = vi.fn(() => void calls.push("clearSession"))
        const clearTokens = vi.fn(() => void calls.push("clearTokens"))

        logoutUseCase("https://idp.example", clearSession, platform(navigateTo, clearTokens))

        expect(calls.slice(0, 2)).toEqual(["clearSession", "clearTokens"])
        const url = new URL(calls[2])
        expect(`${url.origin}${url.pathname}`).toBe("https://idp.example/logout")
        expect(url.searchParams.get("client_id")).toBe(CLIENT_ID)
        expect(url.searchParams.get("post_logout_redirect_uri")).toBe("https://app.example/")
    })

    it("on the desktop, revokes the app's own session as it clears it and goes back to the landing", () => {
        const calls: string[] = []
        const navigateTo = vi.fn((url: string) => void calls.push(url))

        logoutUseCase(
            "https://idp.example",
            () => void calls.push("clearSession"),
            platform(navigateTo, () => void calls.push("clearTokens"), false),
        )

        expect(calls).toEqual(["clearSession", "clearTokens", "/"])
    })
})
