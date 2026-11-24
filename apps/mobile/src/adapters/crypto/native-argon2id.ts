import { requireNativeModule } from "expo"
import type { Argon2id } from "@pinai/crypto/argon2"

/** `OpenMls.argon2id`: the native library's, asynchronous. */
interface NativeArgon2id {
    argon2id(password: Uint8Array, salt: Uint8Array, passes: number, memoryKib: number, lanes: number, length: number): Promise<Uint8Array>
}

/** Argon2id from the native library: what @noble computes, without tens of seconds on Hermes. */
export function nativeArgon2id(native: NativeArgon2id = requireNativeModule<NativeArgon2id>("OpenMls")): Argon2id {
    return (password, salt, { t, m, p, dkLen }) => native.argon2id(password, salt, t, m, p, dkLen)
}
