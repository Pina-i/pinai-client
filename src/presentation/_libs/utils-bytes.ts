/**
 * Base64url and base64 byte-encoding helpers.
 *
 * - base64url (RFC 7515 §2) — URL-safe alphabet (`-` and `_` instead of `+`
 *   and `/`), padding stripped. Used by JWS / JWK encoded values.
 * - base64 (RFC 4648 §4) — the standard alphabet with `=` padding. Used by
 *   the IdP attestation wire format (Phase 7).
 */

export function base64urlToBytes(s: string): Uint8Array {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4))
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
}

export function bytesToBase64url(bytes: Uint8Array): string {
    let s = ""
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function bytesToBase64(bytes: Uint8Array): string {
    let s = ""
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s)
}

export function base64ToBytes(s: string): Uint8Array {
    const bin = atob(s)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
}
