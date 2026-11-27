/**
 * Argon2id (RFC 9106, v0x13), as the history key and the approval code use it. Taken as a parameter: the web
 * computes it with @noble, the phone natively — in JavaScript on Hermes it would take tens of seconds.
 * `@pinai/crypto/contract/argon2` holds what any implementation must answer.
 */

import { argon2idAsync } from "@noble/hashes/argon2.js"

/** Passes (`t`), memory in KiB (`m`), lanes (`p`), the output's length in bytes (`dkLen`). */
export interface Argon2Params {
    readonly t: number
    readonly m: number
    readonly p: number
    readonly dkLen: number
}

export type Argon2id = (password: Uint8Array, salt: Uint8Array, params: Argon2Params) => Promise<Uint8Array>

export const nobleArgon2id: Argon2id = (password, salt, params) => argon2idAsync(password, salt, params)
