import { sha256 } from "@noble/hashes/sha2.js"

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const VISIBLE_CHARS = 8

/** "XXXX-XXXX": sha256 of the device id in base32, 40 bits — tells a user's devices apart at a glance; display only, nothing checks it. */
export function deviceShortId(deviceUuid: string): string {
    const bytes = new TextEncoder().encode(deviceUuid)
    const digest = sha256(bytes)
    const encoded = base32EncodeNoPad(digest).slice(0, VISIBLE_CHARS)
    return `${encoded.slice(0, 4)}-${encoded.slice(4, 8)}`
}

function base32EncodeNoPad(bytes: Uint8Array): string {
    let bits = 0
    let value = 0
    let out = ""
    for (let i = 0; i < bytes.length; i++) {
        value = (value << 8) | bytes[i]
        bits += 8
        while (bits >= 5) {
            out += ALPHABET[(value >>> (bits - 5)) & 0x1f]
            bits -= 5
        }
    }
    if (bits > 0) {
        out += ALPHABET[(value << (5 - bits)) & 0x1f]
    }
    return out
}
