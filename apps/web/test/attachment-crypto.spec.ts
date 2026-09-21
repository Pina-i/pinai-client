/**
 * Attachment sealing is protocol-visible: the key, nonce and AAD travel to
 * the peer inside the MLS body, so every implementation has to agree on the
 * bytes. This file is that agreement.
 *
 * The implementation moved from WebCrypto to `@noble/ciphers` so it can run
 * where `crypto.subtle` does not — React Native. These cases assert the move
 * changed nothing observable: a ciphertext produced by WebCrypto still opens,
 * and one produced by the shipped code opens under WebCrypto. A sender on the
 * web and a receiver on a device therefore stay interoperable, which is the
 * whole reason this code is allowed to be shared.
 *
 * Byte comparisons go through `bytes()` rather than `toEqual` on the arrays:
 * under jsdom the noble modules run in the Node realm while `TextEncoder`
 * hands back a jsdom-realm `Uint8Array`, and a deep-equal between the two
 * fails on constructor identity while reporting "no visual difference". The
 * contents are what this file is actually about.
 */
import { describe, expect, it } from "vitest"

import { decryptDownloaded, encryptForUpload } from "@pinai/crypto/attachment-crypto"
import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import type { LocalFile } from "@pinai/domain/models/file"

const PLAINTEXT = new TextEncoder().encode("attachment bytes, the same on every platform")

/** Realm-independent view of the bytes, for comparison. */
const bytes = (a: Uint8Array | ArrayBuffer) => Array.from(new Uint8Array(a))

function file(bytes: Uint8Array): LocalFile {
    return { name: "note.txt", mimeType: "text/plain", bytes }
}

/** What the previous WebCrypto implementation did, kept as the reference. */
async function sealWithWebCrypto(
    plaintext: Uint8Array,
): Promise<{ ciphertext: Uint8Array; key: AttachmentBlobKey }> {
    const id = crypto.randomUUID()
    const nonce = crypto.getRandomValues(new Uint8Array(12))
    const cryptoKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        /* extractable */ true,
        ["encrypt", "decrypt"],
    )
    const aad = new TextEncoder().encode(id)
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce, additionalData: aad as BufferSource },
        cryptoKey,
        plaintext as BufferSource,
    )
    const raw = await crypto.subtle.exportKey("raw", cryptoKey)
    return {
        ciphertext: new Uint8Array(ciphertext),
        key: {
            id,
            key: new Uint8Array(raw),
            nonce,
            original_filename: "note.txt",
            mime_type: "text/plain",
            byte_size: plaintext.length,
        },
    }
}

describe("attachment crypto — cross-implementation wire format", () => {
    it("opens a ciphertext produced by WebCrypto", async () => {
        const { ciphertext, key } = await sealWithWebCrypto(PLAINTEXT)
        expect(bytes(await decryptDownloaded(ciphertext, key))).toEqual(bytes(PLAINTEXT))
    })

    it("produces a ciphertext WebCrypto can open", async () => {
        const { ciphertext, key } = await encryptForUpload(file(PLAINTEXT))
        const imported = await crypto.subtle.importKey(
            "raw",
            key.key as BufferSource,
            { name: "AES-GCM", length: 256 },
            false,
            ["decrypt"],
        )
        const opened = await crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: key.nonce as BufferSource,
                additionalData: new TextEncoder().encode(key.id) as BufferSource,
            },
            imported,
            ciphertext as BufferSource,
        )
        expect(bytes(opened)).toEqual(bytes(PLAINTEXT))
    })

    it("round-trips through its own implementation", async () => {
        const { ciphertext, key } = await encryptForUpload(file(PLAINTEXT))
        expect(bytes(await decryptDownloaded(ciphertext, key))).toEqual(bytes(PLAINTEXT))
        expect(key.byte_size).toBe(PLAINTEXT.length)
        expect(key.key.length).toBe(32)
        expect(key.nonce.length).toBe(12)
    })

    it("binds the attachment id as AAD — a swapped id fails to open", async () => {
        const { ciphertext, key } = await encryptForUpload(file(PLAINTEXT))
        await expect(
            decryptDownloaded(ciphertext, { ...key, id: crypto.randomUUID() }),
        ).rejects.toThrow()
    })

    it("fails closed on a tampered ciphertext", async () => {
        const { ciphertext, key } = await encryptForUpload(file(PLAINTEXT))
        ciphertext[0] ^= 0xff
        await expect(decryptDownloaded(ciphertext, key)).rejects.toThrow()
    })
})
