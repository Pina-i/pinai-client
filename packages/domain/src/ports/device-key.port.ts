/**
 * Bytes sealed under the device key, with the nonce they were sealed with.
 * The nonce is not a secret — it is stored alongside the ciphertext.
 */
export interface SealedBytes {
    ciphertext: Uint8Array
    nonce: Uint8Array
}

/**
 * At-rest encryption bound to this device.
 *
 * The port exposes **operations, never the key**. That is the whole point:
 * on the web the key is a non-extractable `CryptoKey`, so an attacker with
 * execution access can ask it to decrypt but cannot lift the raw bytes and
 * carry them to another machine. On a device the equivalent guarantee comes
 * from the Keychain / Keystore, which hands back no JavaScript object at
 * all. Neither representation can be named in shared code, and a port that
 * returned a key handle would force one of them on the other.
 *
 * Everything sealed here stays on the device — the MLS provider snapshot,
 * the identity bundle, the device attestation, the decrypted-message cache.
 * None of it travels, so implementations do not have to agree on a format
 * the way the protocol-level crypto does; they only have to be able to open
 * what they themselves sealed.
 */
export interface IDeviceKeyPort {
    /**
     * The key, loaded — minted on first use. Rejects when it can't be read: a failed read is never
     * taken for an absent key, since minting over the one that exists would make everything sealed
     * under it unreadable.
     */
    ready(): Promise<void>
    seal(plaintext: Uint8Array): Promise<SealedBytes>
    open(sealed: SealedBytes): Promise<Uint8Array>

    /**
     * Forget the key. Everything sealed under it becomes unreadable, which is
     * the point: a device wipe is irreversible without having to overwrite
     * every row that was sealed. The next `seal` mints a fresh key.
     */
    wipe(): Promise<void>
}
