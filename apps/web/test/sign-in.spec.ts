/**
 * The sign-in round trip as the client sees it since the IdP hosts the forms:
 * the `/authorize` URL it leaves with (and the appearance it asks the IdP's
 * pages to paint), and the answer it comes back with on `/callback`.
 */
import { describe, expect, it, vi } from "vitest"

import type { AuthPlatform, AuthSessionKey, IAuthPort } from "@pinai/domain/ports/auth.port"
import {
    appearanceHints,
    DEFAULT_ACCOUNT_SETTINGS,
    type AccountSettingsCopy,
    type AppearanceHints,
} from "@pinai/domain/models/user-settings"
import { prepareLoginUseCase, startLoginUseCase } from "@pinai/domain/usecases/auth/startLogin.usecase"
import { handleCallbackUseCase } from "@pinai/domain/usecases/auth/handleCallback.usecase"
import type { UserProfile } from "@pinai/domain/models/auth"

const IDP = "http://localhost:8080"
const CLIENT_ID = "https://app.example/oauth-client.json"
const ALICE = "https://idp.alice.test/users/alice_xk9mp"

function platform(appearance: AppearanceHints | null = null) {
    const store = new Map<AuthSessionKey, string>()
    const navigateTo = vi.fn<(url: string) => void>()
    const value: AuthPlatform = {
        clientId: CLIENT_ID,
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
        navigation: {
            callbackUrl: () => "https://app.example/callback",
            postLogoutUrl: () => "https://app.example/",
            currentLocation: () => "/",
            navigateTo,
        },
        appearance: () => appearance,
    }
    return { platform: value, store, navigateTo }
}

const authPort: IAuthPort = {
    discoverConfig: async () => ({
        authorization_endpoint: `${IDP}/authorize`,
        token_endpoint: `${IDP}/token`,
        userinfo_endpoint: `${IDP}/userinfo`,
    }),
    exchangeCode: async () => "access-token",
    fetchUserInfo: async () => ({ actor_uri: ALICE }) as UserProfile,
}

describe("appearanceHints", () => {
    const copy = (owner: string | null): AccountSettingsCopy => ({
        settings: { ...DEFAULT_ACCOUNT_SETTINGS, appearance: { family: "lagoon", motif: "raranga" } },
        unsynced: [],
        owner,
    })

    it("are what this device paints, in the mode it paints it", () => {
        expect(appearanceHints(copy(ALICE), "light")).toEqual({ theme: "lagoon-light", motif: "raranga" })
    })

    it("are nothing before anyone signed in on this device: the IdP shows its own", () => {
        expect(appearanceHints(copy(null), "dark")).toBeNull()
    })
})

describe("prepareLoginUseCase", () => {
    it("asks the IdP's pages for this device's appearance", async () => {
        const { platform: p } = platform({ theme: "sand-dark", motif: "tapa1" })
        const url = new URL(await prepareLoginUseCase(IDP, authPort, p))

        expect(`${url.origin}${url.pathname}`).toBe(`${IDP}/authorize`)
        expect(url.searchParams.get("client_id")).toBe(CLIENT_ID)
        expect(url.searchParams.get("theme")).toBe("sand-dark")
        expect(url.searchParams.get("motif")).toBe("tapa1")
    })

    it("asks for nothing when there is no appearance to keep", async () => {
        const { platform: p } = platform()
        const url = new URL(await prepareLoginUseCase(IDP, authPort, p))

        expect(url.searchParams.has("theme")).toBe(false)
        expect(url.searchParams.has("motif")).toBe(false)
        expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    })

    it("leaves the browser where it is; startLoginUseCase is what goes", async () => {
        const { platform: p, navigateTo } = platform()
        const url = await prepareLoginUseCase(IDP, authPort, p)
        expect(navigateTo).not.toHaveBeenCalled()

        await startLoginUseCase(IDP, authPort, p)
        expect(navigateTo).toHaveBeenCalledWith(url)
    })
})

describe("handleCallbackUseCase", () => {
    async function started() {
        const fixture = platform()
        await prepareLoginUseCase(IDP, authPort, fixture.platform)
        return fixture
    }

    it("signs in with the code", async () => {
        const { platform: p } = await started()
        const result = await handleCallbackUseCase(new URLSearchParams({ code: "c", state: "random" }), authPort, p)

        expect(result).toEqual({
            kind: "signed-in",
            session: { accessToken: "access-token", user: { actor_uri: ALICE }, idpUrl: IDP },
        })
    })

    it("goes back to picking a home when the user cancelled on the IdP, the flow forgotten but the IdP kept", async () => {
        const { platform: p, store } = await started()
        const result = await handleCallbackUseCase(
            new URLSearchParams({ error: "access_denied", state: "random" }),
            authPort,
            p,
        )

        expect(result).toEqual({ kind: "cancelled" })
        expect([...store.keys()]).toEqual(["idp_url"])
    })

    it("reports any other error by its code, and only a code-shaped one", async () => {
        const refused = async (error: string) => {
            const { platform: p } = await started()
            return handleCallbackUseCase(new URLSearchParams({ error, state: "random" }), authPort, p)
        }

        expect(await refused("server_error")).toEqual({ kind: "refused", error: "server_error" })
        expect(await refused("Click <here> to win")).toEqual({ kind: "refused", error: null })
    })

    it("trusts no answer, error or code, whose state isn't this sign-in's", async () => {
        const { platform: p } = await started()
        await expect(
            handleCallbackUseCase(new URLSearchParams({ error: "access_denied", state: "forged" }), authPort, p),
        ).rejects.toThrow("State mismatch")
        await expect(
            handleCallbackUseCase(new URLSearchParams({ code: "c", state: "forged" }), authPort, p),
        ).rejects.toThrow("State mismatch")
    })

    it("refuses a callback that carries neither a code nor an error", async () => {
        const { platform: p } = await started()
        await expect(handleCallbackUseCase(new URLSearchParams({ state: "random" }), authPort, p)).rejects.toThrow(
            "Missing authorization code",
        )
    })
})
