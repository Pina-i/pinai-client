/**
 * `IDeviceKeyPort` round trip.
 *
 * The port exists so that at-rest sealing can be expressed without naming a
 * key: the web holds a non-extractable `CryptoKey`, a device holds a
 * Keychain reference. These assertions are what any future implementation
 * has to satisfy — seal/open round-trips, and a tampered ciphertext fails
 * closed rather than returning garbage.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import "fake-indexeddb/auto"

import { WebCryptoDeviceKeyAdapter } from "@/adapters/e2ee/device-key.adapter"
import { IdbKeyValueStore } from "@/adapters/storage/idb-key-value-store.adapter"
import type { IDeviceKeyPort } from "@pinai/domain/ports/device-key.port"

let store: IdbKeyValueStore
let deviceKey: WebCryptoDeviceKeyAdapter

beforeEach(async () => {
    store = new IdbKeyValueStore("pinai-e2ee-device-key-spec")
    await store.clear()
    deviceKey = new WebCryptoDeviceKeyAdapter(store)
})

describe("WebCryptoDeviceKeyAdapter", () => {
    it("round-trips arbitrary bytes", async () => {
        const plaintext = crypto.getRandomValues(new Uint8Array(512))
        const sealed = await deviceKey.seal(plaintext)
        expect(await deviceKey.open(sealed)).toEqual(plaintext)
    })

    it("round-trips empty input", async () => {
        const sealed = await deviceKey.seal(new Uint8Array(0))
        expect(await deviceKey.open(sealed)).toEqual(new Uint8Array(0))
    })

    it("uses a fresh nonce per seal, so identical input yields different bytes", async () => {
        const plaintext = new TextEncoder().encode("the same message twice")
        const a = await deviceKey.seal(plaintext)
        const b = await deviceKey.seal(plaintext)
        expect(a.nonce).not.toEqual(b.nonce)
        expect(a.ciphertext).not.toEqual(b.ciphertext)
    })

    it("fails closed on a tampered ciphertext", async () => {
        const sealed = await deviceKey.seal(new TextEncoder().encode("secret"))
        sealed.ciphertext[0] ^= 0xff
        await expect(deviceKey.open(sealed)).rejects.toThrow()
    })

    it("fails closed on a tampered nonce", async () => {
        const sealed = await deviceKey.seal(new TextEncoder().encode("secret"))
        sealed.nonce[0] ^= 0xff
        await expect(deviceKey.open(sealed)).rejects.toThrow()
    })

    it("mints one non-extractable key and reuses it across instances", async () => {
        const sealed = await deviceKey.seal(new TextEncoder().encode("persisted"))

        const stored = await store.getCryptoKey()
        expect(stored?.extractable).toBe(false)
        expect(stored?.algorithm.name).toBe("AES-GCM")

        // A second adapter over the same store opens what the first sealed,
        // which is the invariant that matters — IndexedDB structured-clones
        // on read, so the `CryptoKey` object itself is never the same one.
        const other = new WebCryptoDeviceKeyAdapter(store)
        expect(new TextDecoder().decode(await other.open(sealed))).toBe("persisted")
    })

    it("wipe() makes everything previously sealed unreadable", async () => {
        const sealed = await deviceKey.seal(new TextEncoder().encode("secret"))
        await deviceKey.wipe()
        // The next call mints a fresh key, so the old ciphertext cannot open.
        await expect(deviceKey.open(sealed)).rejects.toThrow()
    })

    it("does not expose the key itself", async () => {
        const port: (keyof IDeviceKeyPort)[] = ["open", "ready", "seal", "wipe"]
        const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(deviceKey))
        expect(methods.filter((name) => (port as string[]).includes(name)).sort()).toEqual(port.sort())

        await deviceKey.ready()
        expect(Object.values(deviceKey).some((value) => value instanceof CryptoKey)).toBe(false)
    })

    it("mints one key when first used twice at once", async () => {
        const minted = vi.spyOn(store, "putCryptoKey")

        const [a, b] = await Promise.all([
            deviceKey.seal(new TextEncoder().encode("a")),
            deviceKey.seal(new TextEncoder().encode("b")),
        ])

        expect(minted).toHaveBeenCalledOnce()
        const other = new WebCryptoDeviceKeyAdapter(store)
        expect(new TextDecoder().decode(await other.open(a))).toBe("a")
        expect(new TextDecoder().decode(await other.open(b))).toBe("b")
    })

    it("never mints over a key it failed to read", async () => {
        const sealed = await deviceKey.seal(new TextEncoder().encode("kept"))
        const minted = vi.spyOn(store, "putCryptoKey")
        vi.spyOn(store, "getCryptoKey").mockRejectedValueOnce(new Error("IndexedDB unavailable"))
        const fresh = new WebCryptoDeviceKeyAdapter(store)

        await expect(fresh.ready()).rejects.toThrow("IndexedDB unavailable")

        expect(minted).not.toHaveBeenCalled()
        expect(new TextDecoder().decode(await fresh.open(sealed))).toBe("kept")
    })
})
