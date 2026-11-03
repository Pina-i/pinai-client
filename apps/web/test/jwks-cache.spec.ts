import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { JwksCacheAdapter } from "@/adapters/jwks/jwks-cache.adapter"

const ISSUER = "https://idp.alice.com"
const JWKS_BODY = {
    keys: [
        {
            kty: "OKP",
            crv: "Ed25519",
            alg: "EdDSA",
            kid: "key-2026-01",
            x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
        },
    ],
}

describe("JwksCacheAdapter", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        localStorage.clear()
        fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
            return new Response(JSON.stringify(JWKS_BODY), { status: 200 })
        })
    })
    afterEach(() => {
        fetchSpy.mockRestore()
    })

    it("fetches JWKS on first lookup", async () => {
        const cache = new JwksCacheAdapter()
        const key = await cache.getKey(ISSUER, "key-2026-01")
        expect(key).not.toBeNull()
        expect(fetchSpy).toHaveBeenCalledWith(
            `${ISSUER}/.well-known/jwks.json`,
            expect.any(Object),
        )
    })

    it("does not double-fetch within TTL", async () => {
        const cache = new JwksCacheAdapter()
        await cache.getKey(ISSUER, "key-2026-01")
        await cache.getKey(ISSUER, "key-2026-01")
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it("refetches after invalidate(), keys over a minute old", async () => {
        const now = vi.spyOn(Date, "now")
        const cache = new JwksCacheAdapter()
        await cache.getKey(ISSUER, "key-2026-01")
        now.mockReturnValue(Date.now() + 61_000)
        cache.invalidate(ISSUER)
        await cache.getKey(ISSUER, "key-2026-01")
        now.mockRestore()
        expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it("keeps keys under a minute old: forged signatures can't make it hammer the issuer", async () => {
        const cache = new JwksCacheAdapter()
        await cache.getKey(ISSUER, "key-2026-01")
        for (let i = 0; i < 5; i++) {
            cache.invalidate(ISSUER)
            await cache.getKey(ISSUER, "no-such-kid")
        }
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it("gives up on an issuer that doesn't answer, and fails at once for a minute after", async () => {
        fetchSpy.mockImplementation(async () => new Response("", { status: 502 }))
        const cache = new JwksCacheAdapter()

        await expect(cache.getKey(ISSUER, "key-2026-01")).rejects.toThrow()
        await expect(cache.getKey(ISSUER, "key-2026-01")).rejects.toThrow()

        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect((fetchSpy.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal)
    })

    it("returns null for unknown kid even after fresh fetch", async () => {
        const cache = new JwksCacheAdapter()
        const key = await cache.getKey(ISSUER, "no-such-kid")
        expect(key).toBeNull()
    })

    it("dedupes concurrent fetches for the same issuer", async () => {
        const cache = new JwksCacheAdapter()
        await Promise.all([
            cache.getKey(ISSUER, "key-2026-01"),
            cache.getKey(ISSUER, "key-2026-01"),
            cache.getKey(ISSUER, "key-2026-01"),
        ])
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
})
