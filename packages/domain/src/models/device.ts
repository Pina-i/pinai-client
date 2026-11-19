/**
 * `GET /api/keys/devices` rows, base64 decoded to bytes. `is_current` is computed client-side by
 * comparing against the local device id.
 */

import { hexOf } from "./bytes"
import type { DeviceId } from "./e2ee"
import { IdpError } from "./idp-error"
import { cutName, nameLength, readableName } from "./name"

export type DeviceKind = "laptop" | "phone" | "tablet" | "unknown"

/** The Pīna'i app or a browser; `unknown` for a client that never said and whose `User-Agent` didn't tell. */
export type DeviceClient = "app" | "browser" | "unknown"

/** A signature binding the listed root key: by another device's root key, or by a generation's approval key. */
export type DeviceApproval =
    | { by: "device"; device_id: DeviceId; signature: Uint8Array; created_at: string }
    | { by: "passphrase"; generation: number; signature: Uint8Array; created_at: string }

export interface DeviceListEntry {
    device_id: string
    /** The shown name: `chosen_name` when set, else `automatic_name`. */
    display_name: string
    /** The name the device gave itself (its label), or its `User-Agent`'s. */
    automatic_name: string
    /** The name its user gave it, null until then. */
    chosen_name: string | null
    kind: DeviceKind
    client: DeviceClient
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

/** The longest name a user gives a device, in characters (code points) as the IdP counts them. */
export const MAX_DEVICE_NAME_LENGTH = 50

/** `text` cut to `MAX_DEVICE_NAME_LENGTH` code points (`cutName`). */
export function cutDeviceName(text: string): string {
    return cutName(text, MAX_DEVICE_NAME_LENGTH)
}

/**
 * What renaming `device` to `draft` sends: the name as the IdP takes it (`readableName`), or `null`
 * for its automatic name back — nothing readable typed, or that name. `null` overall when the name
 * it is shown by would stay; refused past `MAX_DEVICE_NAME_LENGTH`.
 */
export function deviceRename(
    draft: string,
    device: Pick<DeviceListEntry, "automatic_name" | "chosen_name">,
): { name: string | null } | { refused: "too-long" } | null {
    const typed = readableName(draft)
    if (typed !== null && nameLength(typed) > MAX_DEVICE_NAME_LENGTH) return { refused: "too-long" }
    const name = typed === null || typed === device.automatic_name ? null : typed
    return name === device.chosen_name ? null : { name }
}

/**
 * A rename's refusal past `approval_required` (Revoke's rule): `gone` — the device revoked
 * (`403 access_denied`) or not the account's (`404`) —, `invalid` — a name the IdP won't take
 * (`400`) —, `failed` — anything else, no answer included.
 */
export function renameRefusal(error: unknown): "gone" | "invalid" | "failed" {
    if (!(error instanceof IdpError)) return "failed"
    if (error.status === 404 || (error.status === 403 && error.code === "access_denied")) return "gone"
    return error.status === 400 ? "invalid" : "failed"
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

/**
 * The link JWKS → attestation → root key alone: what announcing and approving a device rest on. The
 * HPKE key is the passphrase's business only.
 */
export type DeviceRootVerdict =
    | { ok: true; deviceId: DeviceId; rootKey: Uint8Array }
    | { ok: false; reason: Exclude<DeviceChainRefusal, "no-hpke-key" | "hpke-signature"> }

/**
 * What a review reads of the list, as one string: a refetch that changed none of it — only who was
 * active when — compares equal, its bytes notwithstanding.
 */
export function deviceListKey(devices: readonly DeviceListEntry[]): string {
    const read = devices.map((d) => [
        d.device_id,
        d.display_name,
        d.revoked_at,
        d.drk_public_key,
        d.attestation_signature,
        d.attestation_kid,
        d.attestation_expires_at,
        d.hpke_public_key,
        d.hpke_key_signature,
        d.approvals,
    ])
    return JSON.stringify(read, (_key, value: unknown) => (value instanceof Uint8Array ? hexOf(value) : value))
}
