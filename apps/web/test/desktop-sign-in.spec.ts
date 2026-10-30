/**
 * Signing in from the desktop app: the IdP's pages in the app's window, the IdP's own desktop
 * client, the password asked each time, the refresh token handed to the main process, and the
 * session it keeps picked up at the next launch.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import type { UserProfile } from "@pinai/domain/models/auth"
import type { AuthPlatform, AuthSessionKey, HeldRefreshToken, IAuthPort } from "@pinai/domain/ports/auth.port"
import { ensureAuthenticatedUseCase } from "@pinai/domain/usecases/auth/ensureAuthenticated.usecase"
import { handleCallbackUseCase } from "@pinai/domain/usecases/auth/handleCallback.usecase"
import { resumeSessionUseCase } from "@pinai/domain/usecases/auth/resume-session.usecase"
import { prepareLoginUseCase } from "@pinai/domain/usecases/auth/startLogin.usecase"
import { OidcAdapter } from "@pinai/api/auth/oidc.adapter"
import {
    DESKTOP_REDIRECT_URI,
    DesktopAuthNavigationAdapter,
} from "@/adapters/desktop/auth-navigation-desktop.adapter"
import type { DesktopBridge } from "@/adapters/desktop/desktop-bridge"
import { DesktopSessionTokenStore } from "@/adapters/desktop/session-token-desktop.adapter"

const IDP = "http://localhost:8080"
const DESKTOP = `${IDP}/clients/desktop.json`
const ALICE = "https://idp.alice.test/users/alice_xk9mp"

function bridge() {
    const handedOver: HeldRefreshToken[] = []
    const value: DesktopBridge = {
        session: {
            store: vi.fn(async (held: HeldRefreshToken) => void handedOver.push(held)),
            renew: vi.fn(async () => ({ kind: "ended" as const })),
            clear: vi.fn(async () => {}),
        },
        signIn: vi.fn(async () => {}),
        updates: {
            status: vi.fn(async () => ({ kind: "none" as const })),
            onChange: vi.fn(() => () => {}),
            restart: vi.fn(async () => {}),
            download: vi.fn(async () => {}),
        },
    }
    return { bridge: value, handedOver }
}

function desktop() {
    const store = new Map<AuthSessionKey, string>()
    const { bridge: b, handedOver } = bridge()
    const platform: AuthPlatform = {
        clientId: (issuer) => `${issuer}/clients/desktop.json`,
        browserSession: false,
        pkce: {
            generateCodeVerifier: () => "verifier",
            computeCodeChallenge: async () => "challenge",
            generateRandomString: () => "random",
        },
        session: {
            get: (key) => store.get(key) ?? null,
            set: (key, v) => void store.set(key, v),
            remove: (key) => void store.delete(key),
            clear: () => store.clear(),
        },
        tokens: new DesktopSessionTokenStore(b),
        navigation: new DesktopAuthNavigationAdapter(b),
        appearance: () => null,
    }
    return { platform, bridge: b, handedOver }
}

const exchangeCode = vi.fn<IAuthPort["exchangeCode"]>(async () => ({
    accessToken: "access-1",
    refreshToken: "refresh-1",
}))
const fetchUserInfo = vi.fn<IAuthPort["fetchUserInfo"]>(async () => ({ actor_uri: ALICE }) as UserProfile)
const authPort: IAuthPort = {
    discoverConfig: async () => ({
        issuer: IDP,
        authorization_endpoint: `${IDP}/authorize`,
        token_endpoint: `${IDP}/token`,
        userinfo_endpoint: `${IDP}/userinfo`,
        revocation_endpoint: `${IDP}/revoke`,
    }),
    exchangeCode,
    refresh: async () => null,
    revoke: async () => {},
    fetchUserInfo,
}

afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
})

describe("a desktop sign-in", () => {
    it("asks the IdP's own desktop client in, to stay signed in, with the password asked again, back to the desktop callback", async () => {
        const { platform } = desktop()
        const url = new URL(await prepareLoginUseCase(IDP, authPort, platform))

        expect(url.searchParams.get("scope")).toBe("openid profile email offline_access")
        expect(url.searchParams.get("client_id")).toBe(DESKTOP)
        expect(url.searchParams.get("redirect_uri")).toBe(DESKTOP_REDIRECT_URI)
        expect(url.searchParams.get("prompt")).toBe("login")
    })

    it("exchanges the code as that client and hands the refresh token to the main process", async () => {
        const { platform, handedOver } = desktop()
        await prepareLoginUseCase(IDP, authPort, platform)

        const result = await handleCallbackUseCase(new URLSearchParams({ code: "c", state: "random" }), authPort, platform)

        expect(result.kind).toBe("signed-in")
        expect(exchangeCode).toHaveBeenCalledWith(
            expect.objectContaining({ clientId: DESKTOP, redirectUri: DESKTOP_REDIRECT_URI }),
        )
        expect(handedOver).toEqual([
            { refreshToken: "refresh-1", tokenEndpoint: `${IDP}/token`, clientId: DESKTOP, revocationEndpoint: `${IDP}/revoke` },
        ])
        expect(platform.tokens.take(), "the page keeps no copy").toBeNull()
    })

    it("never signs in behind the user's back when signed out: the landing offers the IdP again", async () => {
        const { platform, bridge: b } = desktop()

        await expect(ensureAuthenticatedUseCase(false, IDP, authPort, platform)).rejects.toThrow()
        expect(b.signIn).not.toHaveBeenCalled()
    })

    it("shows the IdP's pages in the app's own window, through the main process", () => {
        const { platform, bridge: b } = desktop()

        platform.navigation.navigateTo(`${IDP}/authorize?client_id=x`)

        expect(b.signIn).toHaveBeenCalledWith(`${IDP}/authorize?client_id=x`)
    })

    it("revokes the refresh token through the main process when it is cleared", () => {
        const { platform, bridge: b } = desktop()

        platform.tokens.clear()

        expect(b.session.clear).toHaveBeenCalledTimes(1)
    })
})

describe("resumeSessionUseCase", () => {
    it("picks the kept session up at launch: a renewal, then its account", async () => {
        const session = await resumeSessionUseCase(IDP, async () => ({ kind: "renewed", accessToken: "access-2" }), authPort)

        expect(session).toEqual({ accessToken: "access-2", user: { actor_uri: ALICE }, idpUrl: IDP })
        expect(fetchUserInfo).toHaveBeenCalledWith(`${IDP}/userinfo`, "access-2")
    })

    it("is nothing when no session was kept, or the IdP ended it", async () => {
        expect(await resumeSessionUseCase(IDP, async () => ({ kind: "ended" }), authPort)).toBeNull()
        expect(await resumeSessionUseCase(IDP, async () => ({ kind: "unreachable" }), authPort)).toBeNull()
        expect(fetchUserInfo).not.toHaveBeenCalled()
    })
})

describe("OidcAdapter.revoke", () => {
    it("sends the refresh token to be revoked, as its client, and fails on a refusal", async () => {
        const bodies: string[] = []
        const fetch = vi.fn(async (request: Request) => {
            bodies.push(await request.clone().text())
            return new Response(null, { status: bodies.length === 1 ? 200 : 503 })
        })
        vi.stubGlobal("fetch", fetch)
        const revoke = () =>
            new OidcAdapter().revoke({ revocationEndpoint: `${IDP}/revoke`, clientId: DESKTOP, refreshToken: "refresh-1" })

        await revoke()
        await expect(revoke()).rejects.toThrow("Token revocation failed: 503")
        expect(Object.fromEntries(new URLSearchParams(bodies[0]))).toEqual({
            client_id: DESKTOP,
            token: "refresh-1",
            token_type_hint: "refresh_token",
        })
    })
})
