/** Byte equality for the rules that compare keys: the models can't reach `lib/`. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && a.every((byte, i) => byte === b[i])
}

/** Lowercase hex, for keys that name bytes: not a wire format. */
export function hexOf(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** Standard base64 from the wire as bytes, `null` for what isn't: a ciphertext read before it is decrypted. */
export function base64Bytes(value: string): Uint8Array | null {
    try {
        const bin = atob(value)
        const out = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
        return out
    } catch {
        return null
    }
}

/** Bytes as standard base64: a ciphertext as the wire carries it. */
export function bytesBase64(bytes: Uint8Array): string {
    let s = ""
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s)
}
