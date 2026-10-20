/**
 * The desktop's session in the main process: the refresh token sealed across restarts, never
 * lost to a keychain that answers late, and revoked at sign-out.
 */
import { existsSync, mkdtempSync, readFileSync } from "fs"
import os from "os"
import path from "path"

import type { HeldRefreshToken, IAuthPort } from "@pinai/domain/ports/auth.port"
import { describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({ safeStorage: {} }))

const { KeychainSessionTokenStore, MainSession } = await import("../src/main/session")
type Sealer = import("../src/main/session").Sealer

const HELD: HeldRefreshToken = {
    refreshToken: "refresh-1",
    tokenEndpoint: "http://idp.test/token",
    clientId: "http://idp.test/clients/desktop.json",
    revocationEndpoint: "http://idp.test/revoke",
}

function sealer(secure = true): Sealer {
    return {
        secure: async () => secure,
        seal: async (plain) => Buffer.from(plain).reverse(),
        open: async (sealed) => Buffer.from(sealed).reverse().toString(),
    }
}

function file(): string {
    return path.join(mkdtempSync(path.join(os.tmpdir(), "pinai-desktop-")), "session")
}

function oidc(refresh: IAuthPort["refresh"]) {
    return {
        discoverConfig: vi.fn(),
        exchangeCode: vi.fn(),
        fetchUserInfo: vi.fn(),
        refresh: vi.fn(refresh),
        revoke: vi.fn(async () => {}),
    } satisfies IAuthPort
}

describe("KeychainSessionTokenStore", () => {
    it("seals the token into its file, where the next launch picks it up", async () => {
        const at = file()
        const store = new KeychainSessionTokenStore(at, sealer())
        await store.load()
        store.set(HELD)
        await store.flushed()

        const next = new KeychainSessionTokenStore(at, sealer())
        await next.load()

        expect(readFileSync(at).toString()).not.toContain("refresh-1")
        expect(next.take()).toEqual(HELD)
    })

    it("keeps it in memory only without a keychain", async () => {
        const at = file()
        const store = new KeychainSessionTokenStore(at, sealer(false))
        store.set(HELD)
        await store.flushed()

        expect(existsSync(at)).toBe(false)
        expect(store.take()).toEqual(HELD)
    })
})

describe("MainSession", () => {
    async function kept(at: string) {
        const store = new KeychainSessionTokenStore(at, sealer())
        store.set(HELD)
        await store.flushed()
    }

    it("renews with the kept token, as its client, and keeps the next one", async () => {
        const at = file()
        await kept(at)
        const port = oidc(async () => ({ accessToken: "access-2", refreshToken: "refresh-2" }))

        const renewal = await new MainSession(new KeychainSessionTokenStore(at, sealer()), port).renew()

        expect(renewal).toEqual({ kind: "renewed", accessToken: "access-2" })
        expect(port.refresh).toHaveBeenCalledWith(expect.objectContaining({ clientId: HELD.clientId, refreshToken: "refresh-1" }))
        const next = new KeychainSessionTokenStore(at, sealer())
        await next.load()
        expect(next.take()?.refreshToken).toBe("refresh-2")
    })

    it("forgets the kept token once the IdP refuses it", async () => {
        const at = file()
        await kept(at)
        const session = new MainSession(new KeychainSessionTokenStore(at, sealer()), oidc(async () => null))

        expect(await session.renew()).toEqual({ kind: "ended" })
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(existsSync(at)).toBe(false)
    })

    it("leaves the file to the next launch when the keychain can't open it this one", async () => {
        const at = file()
        await kept(at)
        const port = oidc(async () => null)

        expect(await new MainSession(new KeychainSessionTokenStore(at, sealer(false)), port).renew()).toEqual({ kind: "ended" })
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(port.refresh).not.toHaveBeenCalled()
        expect(existsSync(at)).toBe(true)
    })

    it("signs out by revoking the token at the IdP and deleting it here", async () => {
        const at = file()
        await kept(at)
        const port = oidc(async () => null)

        await new MainSession(new KeychainSessionTokenStore(at, sealer()), port).signOut()

        expect(port.revoke).toHaveBeenCalledWith({
            revocationEndpoint: HELD.revocationEndpoint,
            clientId: HELD.clientId,
            refreshToken: "refresh-1",
        })
        expect(existsSync(at)).toBe(false)
    })
})
