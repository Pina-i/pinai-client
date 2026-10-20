/**
 * Server-shape of `GET /api/keys/devices` rows. `is_current` is computed
 * client-side by comparing against the local device id.
 */

export type DeviceKind = "laptop" | "phone" | "tablet" | "unknown"

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
