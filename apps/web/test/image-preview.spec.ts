/** An image's size and blurhash travel in its attachment key; the receiver trusts them only once checked. */
import { encode, isBlurhashValid } from "blurhash"
import { describe, expect, it, vi } from "vitest"

import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import type { LocalFile } from "@pinai/domain/models/file"
import { MAX_IMAGE_SIDE, imagePreviewOf, isImageAttachment } from "@pinai/domain/models/image-preview"
import type { IAttachmentCryptoPort } from "@pinai/domain/ports/attachment-crypto.port"
import type { IDmPort } from "@pinai/domain/ports/dm.port"
import type { IImageProbePort } from "@pinai/domain/ports/image-probe.port"
import { uploadEncryptedAttachmentUseCase } from "@pinai/domain/usecases/dm/upload-encrypted-attachment.usecase"

const HASH = "LEHV6nWB2yk8pyo0adR*.7kCMdnj"

function key(fields: Partial<AttachmentBlobKey>): AttachmentBlobKey {
    return {
        id: "a",
        key: new Uint8Array(32),
        nonce: new Uint8Array(12),
        original_filename: "cat.png",
        mime_type: "image/png",
        byte_size: 10,
        ...fields,
    }
}

describe("imagePreviewOf", () => {
    it("reads the size and blurhash a key carries", () => {
        expect(imagePreviewOf(key({ width: 640, height: 480, blurhash: HASH }))).toEqual({
            width: 640,
            height: 480,
            blurhash: HASH,
        })
    })

    it("has nothing for a key without a sane size", () => {
        expect(imagePreviewOf(undefined)).toBeNull()
        expect(imagePreviewOf(key({}))).toBeNull()
        expect(imagePreviewOf(key({ width: 640 }))).toBeNull()
        expect(imagePreviewOf(key({ width: 0, height: 480 }))).toBeNull()
        expect(imagePreviewOf(key({ width: 640.5, height: 480 }))).toBeNull()
        expect(imagePreviewOf(key({ width: MAX_IMAGE_SIDE + 1, height: 480 }))).toBeNull()
        expect(imagePreviewOf(key({ width: "640", height: 480 } as unknown as AttachmentBlobKey))).toBeNull()
    })

    it("keeps the size of a key whose blurhash is malformed", () => {
        for (const blurhash of ["", "abc", HASH.slice(0, -1), `${HASH}0`, HASH.replace("W", "!")]) {
            expect(imagePreviewOf(key({ width: 640, height: 480, blurhash }))?.blurhash).toBeNull()
        }
        expect(imagePreviewOf(key({ width: 640, height: 480, blurhash: 42 } as unknown as AttachmentBlobKey))).toEqual({
            width: 640,
            height: 480,
            blurhash: null,
        })
    })

    it("accepts every blurhash the encoder makes, whatever its components", () => {
        const pixels = new Uint8ClampedArray(8 * 8 * 4).map((_, i) => (i * 37) % 256)
        for (let x = 1; x <= 9; x++) {
            for (let y = 1; y <= 9; y++) {
                const hash = encode(pixels, 8, 8, x, y)
                expect(isBlurhashValid(hash).result).toBe(true)
                expect(imagePreviewOf(key({ width: 8, height: 8, blurhash: hash }))?.blurhash).toBe(hash)
            }
        }
    })
})

describe("uploading an image", () => {
    const file: LocalFile = { name: "cat.png", mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) }
    const sealed = { ciphertext: new Uint8Array([9]), key: key({}) }
    const crypto = { encryptForUpload: vi.fn(async () => sealed) } as unknown as IAttachmentCryptoPort
    const dm = {
        uploadAttachment: vi.fn(async () => ({ id: "a" })),
    } as unknown as IDmPort
    const params = { idpUrl: "https://idp.test", accessToken: "t", file }

    it("carries its size and blurhash in its key", async () => {
        const probe: IImageProbePort = { probe: async () => ({ width: 640, height: 480, blurhash: HASH }) }
        const { key: sent } = await uploadEncryptedAttachmentUseCase(dm, crypto, params, probe)
        expect(sent).toMatchObject({ id: "a", width: 640, height: 480, blurhash: HASH })
    })

    it("carries no blurhash field when none was made", async () => {
        const probe: IImageProbePort = { probe: async () => ({ width: 640, height: 480, blurhash: null }) }
        const { key: sent } = await uploadEncryptedAttachmentUseCase(dm, crypto, params, probe)
        expect(sent.width).toBe(640)
        expect("blurhash" in sent).toBe(false)
    })

    it("goes without a preview when the probe fails or finds none", async () => {
        const failing: IImageProbePort = { probe: async () => Promise.reject(new Error("no decoder")) }
        expect(await uploadEncryptedAttachmentUseCase(dm, crypto, params, failing)).toMatchObject({ key: sealed.key })
        const none: IImageProbePort = { probe: async () => null }
        expect((await uploadEncryptedAttachmentUseCase(dm, crypto, params, none)).key).toBe(sealed.key)
        expect((await uploadEncryptedAttachmentUseCase(dm, crypto, params)).key).toBe(sealed.key)
    })
})

describe("isImageAttachment", () => {
    it("reads the type its key carries: the IdP holds every attachment as octet-stream", () => {
        const wire = { mime_type: "application/octet-stream" }
        expect(isImageAttachment(wire, { mime_type: "image/webp" })).toBe(true)
        expect(isImageAttachment(wire, { mime_type: "application/pdf" })).toBe(false)
        expect(isImageAttachment(wire)).toBe(false)
        expect(isImageAttachment({ mime_type: "image/png" })).toBe(true)
    })
})
