/** Byte equality for the rules that compare keys: the models can't reach `lib/`. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && a.every((byte, i) => byte === b[i])
}

/** Lowercase hex, for keys that name bytes: not a wire format. */
export function hexOf(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}
