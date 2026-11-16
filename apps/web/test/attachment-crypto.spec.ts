/**
 * Attachment sealing is protocol-visible: the key, nonce and AAD travel to
 * the peer inside the MLS body, so every implementation has to agree on the
 * bytes. This file is that agreement.
 *
 * Two implementations ship: the portable one in `@pinai/crypto` (noble), for
 * platforms without WebCrypto, and the web app's own on WebCrypto, faster and
 * off the main thread. A sender on one and a receiver on the other must stay
 * interoperable, both ways.
 *
 * Byte comparisons go through `bytes()` rather than `toEqual` on the arrays:
 * under jsdom the noble modules run in the Node realm while `TextEncoder`
 * hands back a jsdom-realm `Uint8Array`, and a deep-equal between the two
 * fails on constructor identity while reporting "no visual difference". The
 * contents are what this file is actually about.
 */
import { describe, expect, it } from "vitest"

import { WebCryptoAttachmentCryptoAdapter } from "@/adapters/e2ee/attachment-crypto.adapter"
import { NobleAttachmentCryptoAdapter } from "@pinai/crypto/attachment-crypto"
import type { LocalFile } from "@pinai/domain/models/file"
import type { IAttachmentCryptoPort } from "@pinai/domain/ports/attachment-crypto.port"

const PLAINTEXT = new TextEncoder().encode("attachment bytes, the same on every platform")

/** Realm-independent view of the bytes, for comparison. */
const bytes = (a: Uint8Array | ArrayBuffer) => Array.from(new Uint8Array(a))

function file(bytes: Uint8Array): LocalFile {
    return { name: "note.txt", mimeType: "text/plain", bytes }
}

const noble = new NobleAttachmentCryptoAdapter()
const webCrypto = new WebCryptoAttachmentCryptoAdapter()

describe("attachment crypto — cross-implementation wire format", () => {
    it("opens under WebCrypto what noble sealed", async () => {
        const { ciphertext, key } = await noble.encryptForUpload(file(PLAINTEXT))
        expect(bytes(await webCrypto.decryptDownloaded(ciphertext, key))).toEqual(bytes(PLAINTEXT))
    })

    it("opens under noble what WebCrypto sealed", async () => {
        const { ciphertext, key } = await webCrypto.encryptForUpload(file(PLAINTEXT))
        expect(bytes(await noble.decryptDownloaded(ciphertext, key))).toEqual(bytes(PLAINTEXT))
    })
})

describe.each<[string, IAttachmentCryptoPort]>([
    ["noble", noble],
    ["WebCrypto", webCrypto],
])("attachment crypto — %s", (_, port) => {
    it("round-trips through its own implementation", async () => {
        const { ciphertext, key } = await port.encryptForUpload(file(PLAINTEXT))
        expect(bytes(await port.decryptDownloaded(ciphertext, key))).toEqual(bytes(PLAINTEXT))
        expect(key.byte_size).toBe(PLAINTEXT.length)
        expect(key.key.length).toBe(32)
        expect(key.nonce.length).toBe(12)
        expect(key.mime_type).toBe("text/plain")
        expect(key.original_filename).toBe("note.txt")
    })

    it("mints a fresh id, key and nonce for every attachment", async () => {
        const a = await port.encryptForUpload(file(PLAINTEXT))
        const b = await port.encryptForUpload(file(PLAINTEXT))
        expect(a.key.id).not.toBe(b.key.id)
        expect(bytes(a.key.key)).not.toEqual(bytes(b.key.key))
        expect(bytes(a.key.nonce)).not.toEqual(bytes(b.key.nonce))
    })

    it("binds the attachment id as AAD — a swapped id fails to open", async () => {
        const { ciphertext, key } = await port.encryptForUpload(file(PLAINTEXT))
        await expect(port.decryptDownloaded(ciphertext, { ...key, id: crypto.randomUUID() })).rejects.toThrow()
    })

    it("fails closed on a tampered ciphertext", async () => {
        const { ciphertext, key } = await port.encryptForUpload(file(PLAINTEXT))
        ciphertext[0] ^= 0xff
        await expect(port.decryptDownloaded(ciphertext, key)).rejects.toThrow()
    })
})
