import { describe, expect, it, vi } from "vitest"

import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"

vi.mock("@/ioc", () => ({ getDmPort: vi.fn(), getAttachmentCryptoPort: vi.fn() }))
vi.mock("@/store/store", () => ({ useAppStore: { getState: () => ({ user: null }), subscribe: () => () => {} } }))

const { AttachmentCache } = await import("@/presentation/_libs/attachment-cache")

function key(id: string): AttachmentBlobKey {
    return {
        id,
        key: new Uint8Array(32),
        nonce: new Uint8Array(12),
        original_filename: `${id}.png`,
        mime_type: "image/png",
        byte_size: 10,
    }
}

function setUp(budget = 100, size = 40) {
    const revoked: string[] = []
    const open = vi.fn(async (_: AttachmentBlobKey) => new Uint8Array(size))
    let n = 0
    const cache = new AttachmentCache(open, budget, {
        create: () => `blob:${++n}`,
        revoke: (url) => revoked.push(url),
    })
    return { cache, open, revoked }
}

describe("the attachment cache", () => {
    it("opens an attachment once however many ask, then answers it at once", async () => {
        const { cache, open } = setUp()
        const [a, b] = await Promise.all([cache.load(key("a")), cache.load(key("a"))])
        expect(a).toBe(b)
        expect(open).toHaveBeenCalledTimes(1)
        expect(cache.url("a")).toBe(a)
        expect(await cache.load(key("a"))).toBe(a)
        expect(open).toHaveBeenCalledTimes(1)
    })

    it("lets the least recently used go past its budget", async () => {
        const { cache, revoked } = setUp()
        const a = await cache.load(key("a"))
        await cache.load(key("b"))
        cache.hold("a")()
        await cache.load(key("c"))
        expect(revoked).toEqual(["blob:2"])
        expect(cache.url("a")).toBe(a)
        expect(cache.url("b")).toBeNull()
    })

    it("never lets go of one held on screen, and lets it go once released", async () => {
        const { cache, revoked } = setUp()
        const release = cache.hold("a")
        const a = await cache.load(key("a"))
        await cache.load(key("b"))
        await cache.load(key("c"))
        expect(cache.url("a")).toBe(a)
        expect(revoked).toEqual(["blob:2"])
        release()
        await cache.load(key("d"))
        expect(cache.url("a")).toBeNull()
        expect(revoked).toContain(a)
    })

    it("opens again what failed, rather than keeping the failure", async () => {
        const { cache, open } = setUp()
        open.mockRejectedValueOnce(new Error("network"))
        await expect(cache.load(key("a"))).rejects.toThrow("network")
        expect(await cache.load(key("a"))).toBe("blob:1")
        expect(open).toHaveBeenCalledTimes(2)
    })

    it("prefetches only what isn't opened, and swallows a failure", async () => {
        const { cache, open } = setUp()
        await cache.load(key("a"))
        open.mockRejectedValueOnce(new Error("network"))
        cache.prefetch([key("a"), key("b")])
        await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2))
        expect(cache.url("b")).toBeNull()
    })

    it("lets go of everything when cleared, a load under way included", async () => {
        const { cache, open, revoked } = setUp()
        const a = await cache.load(key("a"))
        let finish!: (bytes: Uint8Array<ArrayBuffer>) => void
        open.mockImplementationOnce(() => new Promise<Uint8Array<ArrayBuffer>>((resolve) => (finish = resolve)))
        const pending = cache.load(key("b"))
        cache.clear()
        finish(new Uint8Array(40))
        await expect(pending).rejects.toThrow()
        expect(revoked).toEqual([a])
        expect(cache.url("a")).toBeNull()
        expect(cache.url("b")).toBeNull()
    })
})
