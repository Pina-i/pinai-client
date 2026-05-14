import { sha256 } from "@noble/hashes/sha2.js"

/**
 * Short human-readable identifier for a device, rendered next to the
 * display name in Settings → Devices. Deterministic transform of the
 * device UUID — sha256(utf8(uuid)) → RFC 4648 base32 (no padding) →
 * truncated to 8 chars, grouped as "XXXX-XXXX".
 *
 * 8 chars × 5 bits = 40 bits — enough entropy to disambiguate a few
 * dozen devices for a single user (collisions are astronomically
 * unlikely at that scale), short enough to read aloud during pairing.
 * The fingerprint is *for display only*; identity / authn use the MSK
 * fingerprint from `identity.adapter.ts`.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const VISIBLE_CHARS = 8

export function deviceFingerprint(deviceUuid: string): string {
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
