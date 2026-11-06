import { deviceStatus, type DeviceListEntry } from "@pinai/domain/models/device"
import { formatLastSeen } from "@pinai/domain/models/relative-time"

import { dayLabel } from "./day-label"

/** "Active 3 days ago", "Signed in", "Last seen yesterday", "Revoked 4 Nov": a device's row in Settings → Devices. */
export function activityLabel(device: DeviceListEntry & { is_current?: boolean }, now = new Date()): string | null {
    // This device is in use as the list is read, whatever its session's last renewal says.
    if (device.is_current) return "Active now"
    const status = deviceStatus(device)
    switch (status.kind) {
        case "revoked":
            return `Revoked ${dayLabel(status.at)}`
        case "signed-in": {
            const seen = status.lastActiveAt && formatLastSeen(status.lastActiveAt, now)
            return seen ? `Active ${seen}` : "Signed in"
        }
        case "signed-out": {
            const seen = formatLastSeen(device.last_seen_at, now)
            return seen ? `Last seen ${seen}` : null
        }
    }
}
