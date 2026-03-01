/** Generate a cryptographically random code verifier (64 URL-safe chars). */
export function generateCodeVerifier(): string {
    const array = new Uint8Array(48)
    crypto.getRandomValues(array)
    return base64UrlEncode(array)
}

/** Compute S256 code challenge: BASE64URL(SHA-256(verifier)). */
export async function computeCodeChallenge(verifier: string): Promise<string> {
    const encoded = new TextEncoder().encode(verifier)
    const hash = await crypto.subtle.digest("SHA-256", encoded)
    return base64UrlEncode(new Uint8Array(hash))
}

/** Generate a random URL-safe string of the given byte length. */
export function generateRandomString(byteLength: number): string {
    const array = new Uint8Array(byteLength)
    crypto.getRandomValues(array)
    return base64UrlEncode(array)
}

function base64UrlEncode(array: Uint8Array): string {
    return btoa(String.fromCharCode(...array))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "")
}
