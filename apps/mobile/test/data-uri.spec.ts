import { describe, expect, it } from "vitest"
import { dataUri } from "../src/presentation/_libs/data-uri"

function bytesOf(uri: string): Uint8Array {
    const binary = atob(uri.slice(uri.indexOf(",") + 1))
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

describe("dataUri", () => {
    it("carries every byte, past a chunk too", () => {
        const bytes = Uint8Array.from({ length: 0x8000 * 2 + 17 }, (_, i) => (i * 31) % 256)
        const uri = dataUri(bytes, "image/webp")
        expect(uri.startsWith("data:image/webp;base64,")).toBe(true)
        expect(bytesOf(uri)).toEqual(bytes)
        expect(dataUri(new Uint8Array(), "image/png")).toBe("data:image/png;base64,")
    })

    it("takes a peer's type only when it is a plain media type", () => {
        expect(dataUri(new Uint8Array([1]), "image/svg+xml").startsWith("data:image/svg+xml;base64,")).toBe(true)
        expect(dataUri(new Uint8Array([1]), "image/png;charset=x,").startsWith("data:application/octet-stream;base64,")).toBe(true)
        expect(dataUri(new Uint8Array([1]), "").startsWith("data:application/octet-stream;base64,")).toBe(true)
    })
})
