/**
 * An access token as the IdP signs it, the signature left out — the client never checks it. The
 * password typed at `signedInAt`, the token issued at `issuedAt`, both on the IdP's clock; its
 * session `sid`, a new one unless given.
 */
export function accessToken(signedInAt: number, sub = "alice", issuedAt: number = Date.now(), sid: string = crypto.randomUUID()): string {
    const part = (claims: object) => btoa(JSON.stringify(claims)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")
    const iat = Math.floor(issuedAt / 1000)
    return `${part({ alg: "EdDSA" })}.${part({ sub, iat, exp: iat + 3600, auth_time: Math.floor(signedInAt / 1000), sid })}.sig`
}
