import type { IdbKeyValueStore } from "@/adapters/storage/idb-key-value-store.adapter"
import type { IDeviceKeyPort, SealedBytes } from "@pinai/domain/ports/device-key.port"

const AES_ALGORITHM: AesKeyAlgorithm = { name: "AES-GCM", length: 256 }
const AES_KEY_USAGES: KeyUsage[] = ["encrypt", "decrypt"]
const NONCE_BYTES = 12

/**
 * WebCrypto implementation of {@link IDeviceKeyPort}.
 *
 * Owns the whole lifecycle of the device's at-rest key: minted lazily on
 * first use, non-extractable, persisted as a `CryptoKey` object in
 * IndexedDB, and dropped by {@link wipe}. Nothing outside this class ever
 * holds the key — `seal` and `open` are the only way to use it.
 *
 * `extractable: false` is the guarantee: code running in this origin can ask
 * the key to encrypt and decrypt, but cannot read its bytes, so a stolen
 * database is useless off the device that made it.
 */
export class WebCryptoDeviceKeyAdapter implements IDeviceKeyPort {
    private readonly store: IdbKeyValueStore
    // Kept once loaded: a later read of the slot failing must not be taken for a row the key can't open.
    #key: CryptoKey | null = null
    #loading: Promise<CryptoKey> | null = null

    constructor(store: IdbKeyValueStore) {
        this.store = store
    }

    // One load at a time: two first calls racing would mint two keys, the second overwriting the first.
    #getOrCreateKey(): Promise<CryptoKey> {
        if (this.#key) return Promise.resolve(this.#key)
        if (!this.#loading) {
            const loading: Promise<CryptoKey> = this.#loadOrMint()
                .then((key) => {
                    // Unless wiped meanwhile.
                    if (this.#loading === loading) this.#key = key
                    return key
                })
                .finally(() => {
                    if (this.#loading === loading) this.#loading = null
                })
            this.#loading = loading
        }
        return this.#loading
    }

    // A read that fails throws: only a key truly absent is minted.
    async #loadOrMint(): Promise<CryptoKey> {
        const existing = await this.store.getCryptoKey()
        if (existing) return existing
        const key = await crypto.subtle.generateKey(
            AES_ALGORITHM,
            /* extractable */ false,
            AES_KEY_USAGES,
        )
        await this.store.putCryptoKey(key)
        return key
    }

    async ready(): Promise<void> {
        await this.#getOrCreateKey()
    }

    async seal(plaintext: Uint8Array): Promise<SealedBytes> {
        const key = await this.#getOrCreateKey()
        const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: nonce },
            key,
            plaintext as BufferSource,
        )
        return { ciphertext: new Uint8Array(ciphertext), nonce }
    }

    async open(sealed: SealedBytes): Promise<Uint8Array> {
        const key = await this.#getOrCreateKey()
        const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: sealed.nonce as BufferSource },
            key,
            sealed.ciphertext as BufferSource,
        )
        return new Uint8Array(plaintext)
    }

    async wipe(): Promise<void> {
        this.#key = null
        this.#loading = null
        await this.store.deleteCryptoKey()
    }
}
