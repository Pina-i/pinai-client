/**
 * `GET /api/keys/devices` rows, base64 decoded to bytes. `is_current` is computed client-side by
 * comparing against the local device id.
 */

import type { DeviceId } from "./e2ee"

export type DeviceKind = "laptop" | "phone" | "tablet" | "unknown"

/** A signature binding the listed root key: by another device's root key, or by a generation's approval key. */
export type DeviceApproval =
    | { by: "device"; device_id: DeviceId; signature: Uint8Array; created_at: string }
    | { by: "passphrase"; generation: number; signature: Uint8Array; created_at: string }

export interface DeviceListEntry {
    device_id: string
    display_name: string
    kind: DeviceKind
    /** ISO-8601 / RFC 3339. */
    paired_at: string
    /** ISO-8601 / RFC 3339. */
    last_seen_at: string
    /** ISO-8601 / RFC 3339, or null when the device is active. */
    revoked_at: string | null
    /** A session of it is live: it is signed in. */
    signed_in: boolean
    /** ISO-8601 / RFC 3339: that session's last use (a sign-in or a renewal), null when signed out. */
    last_active_at: string | null
    /** The device's root key and the IdP's attestation of it — the expiry the text it signed. Null without a root key. */
    drk_public_key: Uint8Array | null
    attestation_signature: Uint8Array | null
    attestation_kid: string | null
    attestation_expires_at: string | null
    /** Its HPKE key and its root key's signature over it; null when it registered none. */
    hpke_public_key: Uint8Array | null
    hpke_key_signature: Uint8Array | null
    /** The history key's generation the device says it holds. */
    history_generation: number | null
    /** Oldest first, each binding `drk_public_key`. The IdP lists them; each device verifies them itself. */
    approvals: DeviceApproval[]
}

export interface DeviceListResponse {
    devices: DeviceListEntry[]
}

export type DeviceStatus =
    | { kind: "revoked"; at: string }
    /** `lastActiveAt` is its session's last sign-in or renewal. */
    | { kind: "signed-in"; lastActiveAt: string | null }
    | { kind: "signed-out" }

/**
 * Where a device stands: revoked for good, signed in, or signed out — free to sign in again,
 * as the same device.
 */
export function deviceStatus(device: DeviceListEntry): DeviceStatus {
    if (device.revoked_at !== null) return { kind: "revoked", at: device.revoked_at }
    if (device.signed_in) return { kind: "signed-in", lastActiveAt: device.last_active_at }
    return { kind: "signed-out" }
}

/**
 * The link of the chain JWKS → attestation → root key → HPKE key a listed device fails
 * (`identity-provider/specs/e2ee.md § 3.3`); `unreachable`, the issuer's keys couldn't be had.
 */
export type DeviceChainRefusal =
    | "revoked"
    | "no-root-key"
    | "attestation"
    | "expired"
    | "unreachable"
    | "no-hpke-key"
    | "hpke-signature"

export type DeviceChainVerdict =
    | { ok: true; deviceId: DeviceId; rootKey: Uint8Array; hpkePublicKey: Uint8Array }
    | { ok: false; reason: DeviceChainRefusal }
