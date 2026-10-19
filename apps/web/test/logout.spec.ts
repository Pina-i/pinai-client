import { describe, expect, it, vi } from "vitest"

import type { AuthPlatform } from "@pinai/domain/ports/auth.port"
import { logoutUseCase } from "@pinai/domain/usecases/auth/logout.usecase"

const CLIENT_ID = "https://app.example/oauth-client.json"

function platform(navigateTo: (url: string) => void): AuthPlatform {
    return {
        clientId: CLIENT_ID,
        pkce: {
            generateCodeVerifier: () => "",
            computeCodeChallenge: async () => "",
            generateRandomString: () => "",
        },
        session: { get: () => null, set: () => {}, remove: () => {}, clear: () => {} },
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
    it("clears the session, then sends the browser to the IdP naming this client and where to come back", () => {
        const calls: string[] = []
        const navigateTo = vi.fn((url: string) => void calls.push(url))
        const clearSession = vi.fn(() => void calls.push("clearSession"))

        logoutUseCase("https://idp.example", clearSession, platform(navigateTo))

        expect(calls[0]).toBe("clearSession")
        const url = new URL(calls[1])
        expect(`${url.origin}${url.pathname}`).toBe("https://idp.example/logout")
        expect(url.searchParams.get("client_id")).toBe(CLIENT_ID)
        expect(url.searchParams.get("post_logout_redirect_uri")).toBe("https://app.example/")
    })
})
