/**
 * The code handshake's protocol (`identity-provider/specs/e2ee.md § 3.10`): SPAKE2 (RFC 9382,
 * SPAKE2-P256-SHA256-HKDF-HMAC, `spake2-p256.ts`) keyed by the 6-digit code — made memory-hard
 * and bound to the request —, the RFC's key confirmation, then each device's root key and HPKE key
 * sealed under a key of its direction derived from Ke. The relay carries five messages, each a
 * version byte, a type byte and its payload:
 *
 *   1 share_a    asker → answerer   pA (65)
 *   2 share_b    answerer → asker   pB (65)                     binds the request
 *   3 confirm_a  asker → answerer   cA (32)
 *   4 confirm_b  answerer → asker   cB (32) || seal_B→A(keys) (80)   once cA verified
 *   5 keys_a     asker → answerer   seal_A→B(keys) (80)               once cB verified
 */

import { gcm } from "@noble/ciphers/aes.js"
import { concatBytes } from "@noble/curves/utils.js"
import { argon2idAsync } from "@noble/hashes/argon2.js"
import { hkdf } from "@noble/hashes/hkdf.js"
import { sha256 } from "@noble/hashes/sha2.js"

import {
    APPROVAL_CODE_LENGTH,
    HandshakeRefused,
    isWholeCode,
    type ExchangedKeys,
    type HandshakeRole,
} from "@pinai/domain/models/approval-handshake"
import type { ActorUri, DeviceId } from "@pinai/domain/models/e2ee"
import type { ApprovalHandshakeSession } from "@pinai/domain/ports/e2ee.port"

import {
    SPAKE2_SHARE_BYTES,
    passwordScalar,
    randomScalar,
    sameConfirmation,
    spake2Finish,
    spake2Share,
    type Spake2Secrets,
} from "./spake2-p256"

export const HANDSHAKE_VERSION = 0x01

export const HandshakeMessage = { shareA: 0x01, shareB: 0x02, confirmA: 0x03, confirmB: 0x04, keysA: 0x05 } as const
export type HandshakeMessageType = (typeof HandshakeMessage)[keyof typeof HandshakeMessage]

/**
 * Argon2id (RFC 9106, v0x13) over the code: OWASP's 19 MiB, 2 passes, 1 lane. Nobody gets an
 * offline guess — a man in the middle runs one session against each side, so one code gives it at
 * most two online guesses — and the cost only guards a transcript's secrets leaking. 40 bytes so
 * w = OS2IP mod p is unbiased.
 */
export const CODE_MHF = { t: 2, m: 19 * 1024, p: 1, dkLen: 40 } as const

const LABEL = "PINAI-DEVICE-APPROVAL-HANDSHAKE-v1"
const CODE_SALT_LABEL = "PINAI-APPROVAL-CODE-v1"
const CONFIRMATION_BYTES = 32
const KEY_BYTES = 32
const SEALED_KEYS_BYTES = 2 * KEY_BYTES + 16
// Each direction's key seals exactly one message.
const NONCE = new Uint8Array(12)

const PAYLOAD_BYTES: Record<HandshakeMessageType, number> = {
    [HandshakeMessage.shareA]: SPAKE2_SHARE_BYTES,
    [HandshakeMessage.shareB]: SPAKE2_SHARE_BYTES,
    [HandshakeMessage.confirmA]: CONFIRMATION_BYTES,
    [HandshakeMessage.confirmB]: CONFIRMATION_BYTES + SEALED_KEYS_BYTES,
    [HandshakeMessage.keysA]: SEALED_KEYS_BYTES,
}

const encoder = new TextEncoder()

/** Six digits, uniform: a 32-bit draw kept only below the largest multiple of a million. */
export function newApprovalCode(): string {
    const bound = 2 ** 32 - (2 ** 32 % 1_000_000)
    for (;;) {
        const [draw] = crypto.getRandomValues(new Uint32Array(1))
        if (draw < bound) return String(draw % 1_000_000).padStart(APPROVAL_CODE_LENGTH, "0")
    }
}

/** w: the code's ASCII digits through Argon2id, salted with the request it is good for. */
export async function codeScalar(code: string, requestId: string): Promise<bigint> {
    if (!isWholeCode(code)) throw new Error("An approval code is six digits")
    const salt = encoder.encode(`${CODE_SALT_LABEL}\n${requestId.toLowerCase()}`)
    const password = encoder.encode(code)
    const output = await argon2idAsync(password, salt, CODE_MHF)
    try {
        return passwordScalar(output)
    } finally {
        password.fill(0)
        output.fill(0)
    }
}

/** A side's identity in the transcript: the account and the device, as § 7.2 writes them. */
export function handshakeIdentity(actorUri: string, deviceId: string): Uint8Array {
    return encoder.encode(`${actorUri}\n${deviceId.toLowerCase()}`)
}

/** The key schedule's AAD: the protocol and the request, so confirmation keys are this request's alone. */
export function handshakeAad(requestId: string): Uint8Array {
    return encoder.encode(`${LABEL}\n${requestId.toLowerCase()}`)
}

export function encodeMessage(type: HandshakeMessageType, payload: Uint8Array): Uint8Array {
    if (payload.length !== PAYLOAD_BYTES[type]) throw new Error("A handshake message's payload is its type's size")
    return concatBytes(header(type), payload)
}

/** The payload of a message of `type`, this version, its exact size; anything else is tampering. */
export function decodeMessage(body: Uint8Array, type: HandshakeMessageType): Uint8Array {
    if (body.length !== 2 + PAYLOAD_BYTES[type] || body[0] !== HANDSHAKE_VERSION || body[1] !== type) {
        throw new HandshakeRefused("tampered", "Not the handshake message expected")
    }
    return body.slice(2)
}

function header(type: HandshakeMessageType): Uint8Array {
    return Uint8Array.of(HANDSHAKE_VERSION, type)
}

/** The key sealing one direction's keys, from Ke. */
export function sealingKey(ke: Uint8Array, direction: "A->B" | "B->A"): Uint8Array {
    return hkdf(sha256, ke, new Uint8Array(0), encoder.encode(`${LABEL} keys ${direction}`), KEY_BYTES)
}

function seal(ke: Uint8Array, direction: "A->B" | "B->A", type: HandshakeMessageType, keys: ExchangedKeys): Uint8Array {
    const key = sealingKey(ke, direction)
    try {
        return gcm(key, NONCE, header(type)).encrypt(concatBytes(keys.rootKey, keys.hpkeKey))
    } finally {
        key.fill(0)
    }
}

function open(ke: Uint8Array, direction: "A->B" | "B->A", type: HandshakeMessageType, sealed: Uint8Array): ExchangedKeys {
    const key = sealingKey(ke, direction)
    let plain: Uint8Array
    try {
        plain = gcm(key, NONCE, header(type)).decrypt(sealed)
    } catch {
        throw new HandshakeRefused("tampered", "The peer's keys don't open")
    } finally {
        key.fill(0)
    }
    return { rootKey: plain.slice(0, KEY_BYTES), hpkeKey: plain.slice(KEY_BYTES) }
}

interface Side {
    role: HandshakeRole
    requestId: string
    actorUri: ActorUri
    deviceId: DeviceId
    own: ExchangedKeys
}

/** One side of one exchange: the asker is RFC 9382's A, the answerer its B. */
export class ApprovalHandshake implements ApprovalHandshakeSession {
    private readonly side: Side
    private w: bigint
    private scalar: bigint
    private readonly ownShare: Uint8Array
    private peer: DeviceId | null
    private secrets: Spake2Secrets | null = null
    private expecting: HandshakeMessageType | null

    private constructor(side: Side, peer: DeviceId | null, w: bigint) {
        this.side = side
        this.peer = peer
        this.w = w
        this.scalar = randomScalar()
        this.ownShare = spake2Share(side.role === "asker" ? "A" : "B", w, this.scalar)
        this.expecting = side.role === "asker" ? HandshakeMessage.shareB : HandshakeMessage.shareA
    }

    static async start(input: Side & { code: string; peerDeviceId: DeviceId | null }): Promise<ApprovalHandshake> {
        if (input.role === "answerer" && !input.peerDeviceId) throw new Error("The answerer knows the device asking")
        const w = await codeScalar(input.code, input.requestId)
        const side = { role: input.role, requestId: input.requestId, actorUri: input.actorUri, deviceId: input.deviceId, own: input.own }
        return new ApprovalHandshake(side, input.role === "answerer" ? input.peerDeviceId : null, w)
    }

    // A bigint can't be zeroed in place: dropping it is the most JavaScript allows.
    close(): void {
        const secrets = this.secrets
        if (secrets) for (const bytes of [secrets.k, secrets.transcript, secrets.ke, secrets.ka, secrets.kcA, secrets.kcB]) bytes.fill(0)
        this.secrets = null
        this.w = 0n
        this.scalar = 0n
        this.expecting = null
    }

    opening(): Uint8Array | null {
        return this.side.role === "asker" ? encodeMessage(HandshakeMessage.shareA, this.ownShare) : null
    }

    // A message refused ends this side: nothing more is taken.
    receive(body: Uint8Array, from: DeviceId): { reply: Uint8Array | null; peerKeys: ExchangedKeys | null } {
        try {
            return this.take(body, from)
        } catch (error) {
            this.close()
            throw error
        }
    }

    private take(body: Uint8Array, from: DeviceId): { reply: Uint8Array | null; peerKeys: ExchangedKeys | null } {
        const expecting = this.expecting
        if (expecting === null || (this.peer !== null && from !== this.peer)) {
            throw new HandshakeRefused("tampered", "A handshake message out of turn")
        }
        const payload = decodeMessage(body, expecting)
        switch (expecting) {
            case HandshakeMessage.shareB:
                this.peer = from
                this.finish(payload)
                this.expecting = HandshakeMessage.confirmB
                return { reply: encodeMessage(HandshakeMessage.confirmA, this.keys().confirmA), peerKeys: null }
            case HandshakeMessage.confirmB: {
                this.confirm(payload.slice(0, CONFIRMATION_BYTES), this.keys().confirmB)
                const peerKeys = open(this.keys().ke, "B->A", HandshakeMessage.confirmB, payload.slice(CONFIRMATION_BYTES))
                const sealed = seal(this.keys().ke, "A->B", HandshakeMessage.keysA, this.side.own)
                this.close()
                return { reply: encodeMessage(HandshakeMessage.keysA, sealed), peerKeys }
            }
            case HandshakeMessage.shareA:
                this.finish(payload)
                this.expecting = HandshakeMessage.confirmA
                return { reply: encodeMessage(HandshakeMessage.shareB, this.ownShare), peerKeys: null }
            case HandshakeMessage.confirmA: {
                this.confirm(payload, this.keys().confirmA)
                this.expecting = HandshakeMessage.keysA
                const sealed = seal(this.keys().ke, "B->A", HandshakeMessage.confirmB, this.side.own)
                return { reply: encodeMessage(HandshakeMessage.confirmB, concatBytes(this.keys().confirmB, sealed)), peerKeys: null }
            }
            case HandshakeMessage.keysA: {
                const peerKeys = open(this.keys().ke, "A->B", HandshakeMessage.keysA, payload)
                this.close()
                return { reply: null, peerKeys }
            }
        }
        throw new HandshakeRefused("tampered", "A handshake message out of turn")
    }

    private finish(peerShare: Uint8Array): void {
        const { actorUri, deviceId, role } = this.side
        const peer = handshakeIdentity(actorUri, this.peer as DeviceId)
        const own = handshakeIdentity(actorUri, deviceId)
        try {
            this.secrets = spake2Finish({
                role: role === "asker" ? "A" : "B",
                w: this.w,
                scalar: this.scalar,
                ownShare: this.ownShare,
                peerShare,
                idA: role === "asker" ? own : peer,
                idB: role === "asker" ? peer : own,
                aad: handshakeAad(this.side.requestId),
            })
        } catch {
            throw new HandshakeRefused("tampered", "The peer's share is no point of the group")
        }
    }

    private confirm(received: Uint8Array, expected: Uint8Array): void {
        if (!sameConfirmation(received, expected)) {
            throw new HandshakeRefused("wrong-code", "The confirmation doesn't verify: a wrong code")
        }
    }

    private keys(): Spake2Secrets {
        if (!this.secrets) throw new HandshakeRefused("tampered", "A handshake message out of turn")
        return this.secrets
    }
}
