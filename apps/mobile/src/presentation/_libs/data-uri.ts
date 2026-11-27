// Each chunk is a call's arguments: kept well under what Hermes's register stack takes.
const CHUNK = 0x2000
const MEDIA_TYPE = /^[a-z]+\/[a-z0-9.+-]+$/i

/** Bytes as a `data:` URI, its base64 built a chunk at a time: a character at a time takes seconds on a photo. */
export function dataUri(bytes: Uint8Array, type: string): string {
    let binary = ""
    for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
    // The type comes from a peer's message: anything but a plain media type would change the URI.
    return `data:${MEDIA_TYPE.test(type) ? type : "application/octet-stream"};base64,${btoa(binary)}`
}
