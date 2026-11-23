import { requireNativeModule } from "expo"

import type { IDeviceKeyPort, SealedBytes } from "@pinai/domain/ports/device-key.port"

/** `modules/device-key`: every call names the key by its alias. */
interface DeviceKeyModule {
    ready(alias: string): Promise<void>
    seal(alias: string, plaintext: Uint8Array): Promise<SealedBytes>
    open(alias: string, ciphertext: Uint8Array, nonce: Uint8Array): Promise<Uint8Array>
    wipe(alias: string): Promise<void>
}

/** The device key in the Android Keystore: sealing and opening run there, the key's bytes never reach JavaScript. */
export class KeystoreDeviceKeyAdapter implements IDeviceKeyPort {
    private readonly alias: string
    private readonly native: DeviceKeyModule

    constructor(alias: string, native: DeviceKeyModule = requireNativeModule<DeviceKeyModule>("DeviceKey")) {
        this.alias = alias
        this.native = native
    }

    ready(): Promise<void> {
        return this.native.ready(this.alias)
    }

    seal(plaintext: Uint8Array): Promise<SealedBytes> {
        return this.native.seal(this.alias, plaintext)
    }

    open(sealed: SealedBytes): Promise<Uint8Array> {
        return this.native.open(this.alias, sealed.ciphertext, sealed.nonce)
    }

    wipe(): Promise<void> {
        return this.native.wipe(this.alias)
    }
}
