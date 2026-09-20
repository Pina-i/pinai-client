import type { IDeviceKeyPort, SealedBytes } from "@/domain/ports/device-key.port"
import type { E2eeStorage } from "./storage.adapter"

const NONCE_BYTES = 12

/**
 * WebCrypto implementation of {@link IDeviceKeyPort}.
 *
 * Wraps the non-extractable AES-256-GCM `CryptoKey` that
 * `IndexedDbStorageAdapter` mints and persists. Taking the storage rather
 * than the key keeps the lazy "generate on first use" behaviour, and keeps
 * the `CryptoKey` itself inside the adapter layer — nothing outside ever
 * holds one.
 */
export class WebCryptoDeviceKeyAdapter implements IDeviceKeyPort {
    private readonly storage: Pick<E2eeStorage, "getOrCreateDeviceKey">

    constructor(storage: Pick<E2eeStorage, "getOrCreateDeviceKey">) {
        this.storage = storage
    }

    async seal(plaintext: Uint8Array): Promise<SealedBytes> {
        const key = await this.storage.getOrCreateDeviceKey()
        const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: nonce },
            key,
            plaintext as BufferSource,
        )
        return { ciphertext: new Uint8Array(ciphertext), nonce }
    }

    async open(sealed: SealedBytes): Promise<Uint8Array> {
        const key = await this.storage.getOrCreateDeviceKey()
        const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: sealed.nonce as BufferSource },
            key,
            sealed.ciphertext as BufferSource,
        )
        return new Uint8Array(plaintext)
    }
}
