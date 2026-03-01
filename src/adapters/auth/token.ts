/**
 * Returns true if the given JWT access token is present and its `exp` claim
 * is in the future. Does not verify the signature — that is the IdP's job.
 */
export function isTokenValid(token: string | null): boolean {
    if (!token) return false
    try {
        const payload = JSON.parse(
            atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        ) as { exp?: number }
        return typeof payload.exp === "number" && Date.now() / 1000 < payload.exp
    } catch {
        return false
    }
}
