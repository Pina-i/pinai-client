/**
 * `IDeviceKeyPort` round trip.
 *
 * The port exists so that at-rest sealing can be expressed without naming a
 * key: the web holds a non-extractable `CryptoKey`, a device holds a
 * Keychain reference. These assertions are what any future implementation
 * has to satisfy — seal/open round-trips, and a tampered ciphertext fails
 * closed rather than returning garbage.
 */
import { beforeAll, describe, expect, it } from "vitest"

import { WebCryptoDeviceKeyAdapter } from "@/adapters/e2ee/device-key.adapter"

let deviceKey: WebCryptoDeviceKeyAdapter

beforeAll(async () => {
    const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        /* extractable */ false,
        ["encrypt", "decrypt"],
    )
    deviceKey = new WebCryptoDeviceKeyAdapter({ getOrCreateDeviceKey: async () => key })
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

    it("does not expose the key itself", () => {
        expect(Object.keys(deviceKey)).not.toContain("key")
        expect(
            Object.getOwnPropertyNames(Object.getPrototypeOf(deviceKey)).sort(),
        ).toEqual(["constructor", "open", "seal"])
    })
})
