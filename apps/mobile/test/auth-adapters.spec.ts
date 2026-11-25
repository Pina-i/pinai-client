/// <reference types="node" />
import { webcrypto } from "node:crypto"
import type { HeldRefreshToken, IAuthPort } from "@pinai/domain/ports/auth.port"
import { describe, expect, it, vi } from "vitest"
import { callbackParams, MobileAuthNavigationAdapter } from "../src/adapters/auth/auth-navigation-mobile.adapter"
import { MemoryAuthSessionStore } from "../src/adapters/auth/auth-session-memory.adapter"
import { ExpoPkceAdapter } from "../src/adapters/auth/pkce-expo.adapter"
import { KeychainSessionTokenStore, type SyncKeychain } from "../src/adapters/auth/session-token-keychain.adapter"

const pkce = new ExpoPkceAdapter({
    getRandomValues: (array) => webcrypto.getRandomValues(array),
    sha256: (data) => webcrypto.subtle.digest("SHA-256", data),
})

describe("ExpoPkceAdapter", () => {
    it("computes RFC 7636's S256 challenge", async () => {
        expect(await pkce.computeCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        )
    })

    it("makes verifiers of 64 URL-safe characters, never twice the same", () => {
        const a = pkce.generateCodeVerifier()
        expect(a).toMatch(/^[A-Za-z0-9_-]{64}$/)
        expect(pkce.generateCodeVerifier()).not.toBe(a)
    })
})

describe("MemoryAuthSessionStore", () => {
    it("keeps the sign-in's scratch until cleared", () => {
        const store = new MemoryAuthSessionStore()
        store.set("pkce_state", "s")
        store.set("pkce_verifier", "v")
        store.remove("pkce_verifier")

        expect(store.get("pkce_state")).toBe("s")
        expect(store.get("pkce_verifier")).toBeNull()
        store.clear()
        expect(store.get("pkce_state")).toBeNull()
    })
})

const HELD: HeldRefreshToken = {
    refreshToken: "refresh-1",
    tokenEndpoint: "http://localhost:8080/token",
    clientId: "http://localhost:8080/clients/mobile.json",
    revocationEndpoint: "http://localhost:8080/revoke",
}

function keychain(initial: string | null = null) {
    const items = new Map<string, string>()
    if (initial !== null) items.set("pinai.refresh-token", initial)
    const chain: SyncKeychain = {
        getItem: (key) => items.get(key) ?? null,
        setItem: (key, value) => void items.set(key, value),
    }
    return { chain, stored: () => items.get("pinai.refresh-token") ?? null }
}

function revoking() {
    const revoke = vi.fn<IAuthPort["revoke"]>(async () => {})
    return { port: { revoke } as unknown as IAuthPort, revoke }
}

describe("KeychainSessionTokenStore", () => {
    it("keeps the refresh token in the keychain, for the next launch", () => {
        const { chain, stored } = keychain()
        new KeychainSessionTokenStore(chain, revoking().port).set(HELD)

        expect(new KeychainSessionTokenStore(chain, revoking().port).take()).toEqual(HELD)
        expect(stored()).toBe("")
    })

    it("hands the token out once: a renewal puts its successor back", () => {
        const { chain } = keychain(JSON.stringify(HELD))
        const tokens = new KeychainSessionTokenStore(chain, revoking().port)

        expect(tokens.take()).toEqual(HELD)
        expect(tokens.take()).toBeNull()
        tokens.set({ ...HELD, refreshToken: "refresh-2" })
        expect(tokens.take()?.refreshToken).toBe("refresh-2")
    })

    it("revokes the token it held when cleared, and forgets it", () => {
        const { chain, stored } = keychain(JSON.stringify(HELD))
        const { port, revoke } = revoking()

        new KeychainSessionTokenStore(chain, port).clear()

        expect(revoke).toHaveBeenCalledWith({
            revocationEndpoint: "http://localhost:8080/revoke",
            clientId: HELD.clientId,
            refreshToken: "refresh-1",
        })
        expect(stored()).toBe("")
    })

    it("reads a value it can't make sense of as no token", () => {
        for (const raw of ["", "not json", JSON.stringify({ refreshToken: "r" })]) {
            expect(new KeychainSessionTokenStore(keychain(raw).chain, revoking().port).take(), raw).toBeNull()
        }
    })

    it("lasts until the app closes when the keychain refuses to write", () => {
        const chain: SyncKeychain = {
            getItem: () => null,
            setItem: () => {
                throw new Error("keystore unavailable")
            },
        }
        const tokens = new KeychainSessionTokenStore(chain, revoking().port)
        tokens.set(HELD)

        expect(tokens.take()).toEqual(HELD)
    })
})

describe("MobileAuthNavigationAdapter", () => {
    function navigation(result: { type: string; url?: string }, closedTo?: () => string) {
        const replace = vi.fn()
        const openAuthSession = vi.fn(async () => result)
        return { adapter: new MobileAuthNavigationAdapter({ replace, openAuthSession }, closedTo), replace, openAuthSession }
    }

    it("reads the IdP's answer off the callback", () => {
        expect(callbackParams("io.github.pina-i:/callback?code=c-1&state=s-1")).toEqual({ code: "c-1", state: "s-1" })
        expect(callbackParams("io.github.pina-i:/callback?error=access_denied&state=s#x")).toEqual({
            error: "access_denied",
            state: "s",
        })
        expect(callbackParams("io.github.pina-i:/callback")).toEqual({})
    })

    it("opens the IdP's pages in the system's sheet, coming back to the app's callback", async () => {
        const { adapter, openAuthSession } = navigation({ type: "success", url: "io.github.pina-i:/callback?code=c&state=s" })

        expect(await adapter.openSignIn("http://localhost:8080/authorize?x=1")).toEqual({
            kind: "returned",
            params: { code: "c", state: "s" },
        })
        expect(openAuthSession).toHaveBeenCalledWith("http://localhost:8080/authorize?x=1", "io.github.pina-i:/callback")
    })

    it("tells a sheet the user closed", async () => {
        for (const type of ["cancel", "dismiss"]) {
            expect(await navigation({ type }).adapter.openSignIn("http://localhost:8080/authorize")).toEqual({ kind: "cancelled" })
        }
    })

    it("goes to an in-app path as a route", () => {
        const { adapter, replace, openAuthSession } = navigation({ type: "cancel" })
        adapter.navigateTo("/")

        expect(replace).toHaveBeenCalledWith("/")
        expect(openAuthSession).not.toHaveBeenCalled()

        adapter.navigateTo("/onboarding/new-device?tab=start-over")
        expect(replace).toHaveBeenLastCalledWith("/onboarding/new-device", { tab: "start-over" })
    })

    it("hands the IdP's answer to the callback, and goes back where it was asked from when the sheet is closed", async () => {
        const answered = navigation({ type: "success", url: "io.github.pina-i:/callback?code=c&state=s" })
        answered.adapter.navigateTo("http://localhost:8080/authorize")
        await vi.waitFor(() => expect(answered.replace).toHaveBeenCalledWith("/callback", { code: "c", state: "s" }))

        const closed = navigation({ type: "cancel" }, () => "/onboarding/new-device?tab=start-over")
        closed.adapter.navigateTo("http://localhost:8080/authorize")
        await vi.waitFor(() => expect(closed.replace).toHaveBeenCalledWith("/onboarding/new-device", { tab: "start-over" }))

        const welcome = navigation({ type: "dismiss" })
        welcome.adapter.navigateTo("http://localhost:8080/authorize")
        await vi.waitFor(() => expect(welcome.replace).toHaveBeenCalledWith("/"))
    })
})
