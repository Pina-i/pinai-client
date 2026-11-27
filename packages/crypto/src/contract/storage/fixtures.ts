/** The rows the scenarios write: made of numbers, never of randomness (the phone's engine has none to offer). */

import type { DeviceTrust } from "@pinai/domain/models/device-trust"
import type { ConversationId, IdentityKeypair } from "@pinai/domain/models/e2ee"
import type { DeviceAttestation, KeptPassphrase, MlsSnapshot, PendingPassphrase } from "../../sealed-storage"

export function bytes(seed: number, length = 32): Uint8Array {
    const out = new Uint8Array(length)
    for (let i = 0; i < length; i++) out[i] = (seed + i) % 256
    return out
}

/** Larger than any row the store holds today: an MLS snapshot of many groups. */
export const LARGE = 4 * 1024 * 1024

export const KEYPAIR: IdentityKeypair = {
    msk_public: bytes(1),
    msk_private: bytes(2),
    ssk_public: bytes(3),
    ssk_private: bytes(4),
    ssk_signature: bytes(5, 64),
    usk_public: bytes(6),
    usk_private: bytes(7),
    usk_signature: bytes(8, 64),
}

export const SNAPSHOT: MlsSnapshot = {
    provider_state: bytes(9, 128),
    known_group_ids: ["11112222-3333-4444-5555-666677778888" as ConversationId],
}

export const ATTESTATION: DeviceAttestation = {
    drk_public: bytes(10),
    drk_private: bytes(11),
    signature: bytes(12, 64),
    kid: "key-2026-01",
    issued_at: "2026-01-01T00:00:00Z",
    expires_at: "2027-01-01T00:00:00Z",
    signed_message: bytes(13, 96),
    hpke: { public_key: bytes(14), private_key: bytes(15) },
}

export const WORDS = Array.from({ length: 24 }, (_, i) => `word${i + 1}`)

export const KEPT: KeptPassphrase = {
    words: WORDS,
    generation: 2,
    approvedRootKey: bytes(18),
    derived: { salt: bytes(16, 16), hak: bytes(17) },
}

export const PENDING: PendingPassphrase = {
    words: WORDS,
    key: { generation: 1, salt: bytes(19, 16), checkValue: bytes(20), approvalPublicKey: bytes(21) },
    hak: bytes(22),
    mintedAt: 1_762_300_000_000,
}

export const NO_TRUST: DeviceTrust = { seen: [], approved: [], revoked: [], partners: [], partnerApprovals: [], baselines: [], before: [] }

export const PHONE = { deviceId: "phone", rootKey: bytes(30) }
export const TABLET = { deviceId: "tablet", rootKey: bytes(31) }
export const PARTNER = { deviceId: "laptop", rootKey: bytes(32), hpkeKey: bytes(33) }
export const PARTNER_APPROVAL = { partner: { deviceId: "laptop", rootKey: bytes(32) }, rootKey: bytes(35), signature: bytes(36, 64) }
export const BEFORE: DeviceTrust["before"][number] = {
    generation: 2,
    cause: "start-over",
    devices: [PHONE],
    refused: [{ deviceId: "watch", rootKey: bytes(34) }],
}
