/** An X25519 key pair: the raw 32-byte public key, and the private key. */
export interface HpkeKeyPair {
    publicKey: Uint8Array
    privateKey: Uint8Array
}

/** A single-shot seal: `enc`, the 32-byte encapsulated key, and the ciphertext. */
export interface HpkeSealed {
    enc: Uint8Array
    ciphertext: Uint8Array
}

/**
 * HPKE (RFC 9180) in base mode, with the one suite the account's devices seal key shares with —
 * DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-128-GCM (`identity-provider/specs/e2ee.md § 3.11`).
 *
 * Beside {@link IMlsEngine} rather than on it: no group, provider or identity takes part, and the
 * key shares that use it have nothing to do with MLS. It comes from the same Rust crate all the
 * same — openmls's own HPKE —, so the engine's implementations supply it, asynchronous for the
 * same reasons. Bytes in, bytes out: other devices open what this one seals.
 */
export interface IHpkePort {
    generateKeyPair(): Promise<HpkeKeyPair>
    /** Refuses a low-order public key, whose shared secret is all zeros (RFC 9180 § 7.1.4). */
    seal(publicKey: Uint8Array, info: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Promise<HpkeSealed>
    /** Rejects when the seal doesn't open under this key, `info` and `aad`. */
    open(privateKey: Uint8Array, sealed: HpkeSealed, info: Uint8Array, aad: Uint8Array): Promise<Uint8Array>
}
