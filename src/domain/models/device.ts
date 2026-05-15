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
}

export interface DeviceListResponse {
    devices: DeviceListEntry[]
}
