/**
 * Phase 6b — Settings → Devices.
 *
 * Server-shape of one device row, returned by `GET /api/keys/devices`.
 * `is_current` is not on the wire — the client computes it by
 * comparing `device_id` to the local `getOrCreateDeviceId()`.
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
