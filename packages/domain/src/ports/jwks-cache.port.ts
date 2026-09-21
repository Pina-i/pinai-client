/** Raw 32-byte Ed25519 public key, ready for `@noble/curves` verify. */
export type Ed25519PublicKey = Uint8Array

/**
 * The issuer's JWKS, as the attestation chain needs it.
 *
 * Verifying a device attestation means fetching the IdP's signing key by
 * `kid` — a network call with a cache in front. The cache is where the
 * platform shows through (the web keeps its TTL in `localStorage`), so the
 * verification code takes this contract instead of a concrete cache.
 *
 * `invalidate` exists for key rotation: a signature that fails under the
 * cached key is retried once against a fresh fetch before being rejected.
 */
export interface IJwksCachePort {
    getKey(issuer: string, kid: string): Promise<Ed25519PublicKey | null>
    invalidate(issuer: string): void
}
