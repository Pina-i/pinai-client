/**
 * The account's devices as Settings → Devices shows them (`identity-provider/specs/e2ee.md § 3.9`):
 * who waits for the user, who holds the history, who approved whom — each only from this device's own
 * verdict; what a device says it holds (`history_generation`) counts only for a device it approves.
 */

import type { ApprovalRequest } from "./approval-handshake"
import type { DeviceListEntry } from "./device"
import {
    sameDevice,
    unapprovedListed,
    type Approver,
    type DeviceTrustVerdict,
    type KnownDevice,
    type TrustEvent,
} from "./device-trust"
import type { DeviceId } from "./e2ee"
import type { HistoryKeyStanding } from "./history-key"

/** This device holds the current passphrase: it shows its words, any other offers "Restore history". */
export function holdsCurrentWords(standing: HistoryKeyStanding): boolean {
    return standing.kind === "holds"
}

type Listed = Pick<DeviceListEntry, "device_id" | "drk_public_key">

function asKnown(device: Listed): KnownDevice | null {
    return device.drk_public_key ? { deviceId: device.device_id, rootKey: device.drk_public_key } : null
}

function inList(devices: readonly KnownDevice[], device: Listed): boolean {
    const known = asKnown(device)
    return known !== null && devices.some((d) => sameDevice(d, known))
}

/** "holds history": on an acting verdict, a device it approves that says it holds that generation. */
export function holdsHistory(
    device: Listed & Pick<DeviceListEntry, "revoked_at" | "history_generation">,
    verdict: DeviceTrustVerdict | null,
): boolean {
    if (!verdict?.acting || device.revoked_at !== null) return false
    return device.history_generation === verdict.generation && inList(verdict.approved, device)
}

/** "held by N devices". */
export function historyHolders(
    devices: readonly (Listed & Pick<DeviceListEntry, "revoked_at" | "history_generation">)[],
    verdict: DeviceTrustVerdict | null,
): number {
    return devices.filter((d) => holdsHistory(d, verdict)).length
}

/** Who approved `device`, from an acting verdict and over the root key listed now; `null` otherwise. */
export function approverOf(verdict: DeviceTrustVerdict | null, device: Listed): Approver | null {
    const known = asKnown(device)
    if (!verdict?.acting || !known) return null
    return verdict.approvedBy.find((d) => sameDevice(d, known))?.approver ?? null
}

/** "approved by …": "this device", another by its label, or "your 24 words"; `null` for an approver no longer listed. */
export function approvedByWording(
    approver: Approver | null,
    devices: readonly Pick<DeviceListEntry, "device_id" | "display_name">[],
    thisDevice: DeviceId | null,
): string | null {
    if (!approver) return null
    if (approver.by === "passphrase") return "your 24 words"
    if (approver.deviceId === thisDevice) return "this device"
    return devices.find((d) => d.device_id === approver.deviceId)?.display_name ?? null
}

/**
 * Who waits for the user, newest first, on an acting verdict only: each device its review left
 * unapproved (`unapproved-device`), and one asking (`requests`, those a seat may answer) that no
 * review has judged yet. A device judged otherwise — approved, unsettled, its chain failing, seen
 * revoked — never sits there.
 */
export function waitingDevices<T extends Listed & Pick<DeviceListEntry, "revoked_at" | "paired_at">>(input: {
    devices: readonly T[]
    events: readonly TrustEvent[]
    verdict: DeviceTrustVerdict | null
    requests: readonly ApprovalRequest[]
}): T[] {
    const { devices, verdict } = input
    if (!verdict?.acting) return []
    const unapproved = unapprovedListed(input.events, devices)
    const asking = new Set(input.requests.map((r) => r.deviceId))
    return devices
        .filter((d) => d.revoked_at === null && d.drk_public_key !== null && d.device_id !== verdict.thisDevice)
        .filter((d) => unapproved.has(d.device_id) || (asking.has(d.device_id) && !inList(verdict.listed, d)))
        .sort((a, b) => Date.parse(b.paired_at) - Date.parse(a.paired_at))
}
