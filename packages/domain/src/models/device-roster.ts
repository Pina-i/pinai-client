/**
 * The account's devices as Settings → Devices shows them (`identity-provider/specs/e2ee.md § 3.9`):
 * who waits for the user, who holds the history, who approved whom — each only from this device's own
 * verdict; what a device says it holds (`history_generation`) counts only for a device it approves.
 */

import type { ApprovalRequest } from "./approval-handshake"
import type { DeviceKind, DeviceListEntry } from "./device"
import { sameDevice, unapprovedListed, type Approver, type DeviceTrustVerdict, type KnownDevice, type TrustEvent } from "./device-trust"
import type { DeviceId } from "./e2ee"
import type { HistoryKeyStanding, PendingHistoryKey } from "./history-key"

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

type Seated = Listed & Pick<DeviceListEntry, "revoked_at" | "paired_at">

/**
 * Who waits for the user, newest first, on an acting verdict only: each device its review left
 * unapproved (`unapproved-device`), and one asking (`requests`, those a seat may answer) that no
 * review has judged yet. A device judged otherwise — approved, unsettled, its chain failing, seen
 * revoked — never sits there, nor one from before (`fromBeforeDevices`); the one the user refused
 * does (`refusedDevice`).
 */
export function waitingDevices<T extends Seated>(input: {
    devices: readonly T[]
    events: readonly TrustEvent[]
    verdict: DeviceTrustVerdict | null
    requests: readonly ApprovalRequest[]
}): T[] {
    const { devices, verdict } = input
    if (!verdict?.acting) return []
    const unapproved = unapprovedListed(input.events, devices)
    const asking = new Set(input.requests.map((r) => r.deviceId))
    return newestFirst(
        devices
            .filter((d) => d.revoked_at === null && d.drk_public_key !== null && d.device_id !== verdict.thisDevice)
            .filter((d) => !inList(verdict.before?.devices ?? [], d))
            .filter((d) => unapproved.has(d.device_id) || (asking.has(d.device_id) && !inList(verdict.listed, d))),
    )
}

/**
 * "From before you started over" — or "you replaced your words" —, newest first, on an acting
 * verdict only: a device its review left unapproved — judged, its chain verified, no revocation —
 * that was listed, under that root key, as this device set the generation it acts under. The user's
 * own: no "waiting for you", no toast, no count. The new words' screen names the same devices.
 */
export function fromBeforeDevices<T extends Seated>(input: {
    devices: readonly T[]
    events: readonly TrustEvent[]
    verdict: DeviceTrustVerdict | null
}): T[] {
    const { devices, verdict } = input
    if (!verdict?.acting || !verdict.before) return []
    const unapproved = unapprovedListed(input.events, devices)
    const before = verdict.before.devices
    return newestFirst(
        devices.filter((d) => d.revoked_at === null && d.device_id !== verdict.thisDevice && unapproved.has(d.device_id) && inList(before, d)),
    )
}

/** The device the user refused when this device started over — "Reset your history — not yours" —, under the root key kept. */
export function refusedDevice(verdict: DeviceTrustVerdict | null, device: Listed): boolean {
    return !!verdict?.acting && inList(verdict.before?.refused ?? [], device)
}

/**
 * This device isn't among those the instance counts approved under its key in force, so the instance
 * refuses it clearing the history backup and signing the other devices out (`approval_required`,
 * `identity-provider/specs/e2ee.md § 3.12`). Without a key in force, or while its count is unknown
 * (`null`), nothing is withheld, and a refusal is said when it comes.
 */
export function notCountedApproved(approvedByInstance: ReadonlySet<DeviceId> | null, thisDevice: DeviceId | null): boolean {
    return approvedByInstance !== null && thisDevice !== null && !approvedByInstance.has(thisDevice)
}

/** "Revoke" withheld on a device the instance counts approved, from a device it doesn't (`notCountedApproved`). */
export function revokeWithheld(
    approvedByInstance: ReadonlySet<DeviceId> | null,
    thisDevice: DeviceId | null,
    device: Pick<DeviceListEntry, "device_id">,
): boolean {
    return notCountedApproved(approvedByInstance, thisDevice) && approvedByInstance !== null && approvedByInstance.has(device.device_id)
}

/** The pencil: Revoke's rule, as the IdP's `may_rename` is `may_revoke`; never on a revoked device. */
export function mayRename(
    approvedByInstance: ReadonlySet<DeviceId> | null,
    thisDevice: DeviceId | null,
    device: Pick<DeviceListEntry, "device_id" | "revoked_at">,
): boolean {
    return device.revoked_at === null && !revokeWithheld(approvedByInstance, thisDevice, device)
}

function newestFirst<T extends Seated>(devices: T[]): T[] {
    return devices.sort((a, b) => Date.parse(b.paired_at) - Date.parse(a.paired_at))
}

/** A listed device, `is_current` marking this one: the server can't tell which device asks. */
export interface RosterDevice extends DeviceListEntry {
    is_current: boolean
}

const DRAWN_KINDS: readonly DeviceKind[] = ["laptop", "phone", "tablet"]

/** The list's rows as every screen reads them: this device marked, a kind the client doesn't draw read as `unknown`. */
export function rosterRows(devices: readonly DeviceListEntry[], thisDevice: DeviceId | null): RosterDevice[] {
    return devices.map((d) => ({
        ...d,
        kind: DRAWN_KINDS.includes(d.kind) ? d.kind : "unknown",
        is_current: thisDevice !== null && d.device_id === thisDevice,
    }))
}

/** Why "Revoke" isn't offered on an approved device, from one that isn't. */
export const ONLY_APPROVED_REVOKES = "Only an approved device can remove an approved device"

/** A rename refused for the same reason: no note of its own on the card, Revoke's is there. */
export const ONLY_APPROVED_RENAMES = "Only an approved device can rename an approved device"

/** Why "Clear history backup" isn't offered on a device the instance doesn't count approved. */
export const ONLY_APPROVED_CLEARS = "Only an approved device can clear the history backup"

/** Why "Sign out other devices" isn't offered there, and what instead: a password reset ends every session. How follows, by the instance's mode. */
export const ONLY_APPROVED_SIGNS_OUT = "Only an approved device can sign out your other devices: change your password instead."

/** A device of the list, as its row says it. */
export interface PaneRow<T> {
    device: T
    holdsHistory: boolean
    /** "this device", another's label, "your 24 words"; `null` on a device that doesn't act. */
    approvedBy: string | null
    /** Approved, while this device isn't: the instance refuses its revoke, so the row says why instead. */
    revokeWithheld: boolean
    /** Revoke's rule, the IdP's for a rename too, and never a revoked device. */
    renamable: boolean
}

export interface DevicesPane<T> {
    thisDevice: DeviceId | null
    /** The rows not seated (waiting, from before), each with its flags. */
    listed: PaneRow<T>[]
    /** "From before you started over" or "…you replaced your words"; `null` with none. */
    fromBeforeHeading: string | null
    /** What a screen reader hears as seats come and go. */
    waitingAnnouncement: string
    /** The instance sent a list naming a device twice: nothing new is trusted until it stops. */
    listRefused: boolean
    /** "held by N devices". */
    heldBy: number
    /** The instance doesn't count this device approved: clearing the backup and signing the others out are withheld. */
    uncounted: boolean
}

/**
 * Settings › Devices from the list, this device's verdict and the instance's count (`null` while unknown, or
 * without a key in force: nothing withheld). `waiting` and `fromBefore` are the seats (`waitingDevices`,
 * `fromBeforeDevices`), read once for the pane and the count on its way in.
 */
export function devicesPane<T extends RosterDevice>(input: {
    rows: readonly T[]
    events: readonly TrustEvent[]
    verdict: DeviceTrustVerdict | null
    waiting: readonly T[]
    fromBefore: readonly T[]
    approvedByInstance: ReadonlySet<DeviceId> | null
}): DevicesPane<T> {
    const { rows, verdict, waiting, fromBefore, approvedByInstance } = input
    const thisDevice = rows.find((d) => d.is_current)?.device_id ?? verdict?.thisDevice ?? null
    const seated = new Set([...waiting, ...fromBefore].map((d) => d.device_id))
    return {
        thisDevice,
        listed: rows
            .filter((d) => !seated.has(d.device_id))
            .map((device) => ({
                device,
                holdsHistory: holdsHistory(device, verdict),
                approvedBy: approvedByWording(approverOf(verdict, device), rows, thisDevice),
                revokeWithheld: revokeWithheld(approvedByInstance, thisDevice, device),
                renamable: mayRename(approvedByInstance, thisDevice, device),
            })),
        fromBeforeHeading:
            fromBefore.length === 0 ? null : verdict?.before?.cause === "replacement" ? "From before you replaced your words" : "From before you started over",
        waitingAnnouncement:
            waiting.length === 0 ? "" : `${waiting.length} waiting for you: ${waiting.map((d) => d.display_name.trim() || "a device").join(", ")}`,
        listRefused: input.events.some((e) => e.kind === "device-list-refused"),
        heldBy: historyHolders(rows, verdict),
        uncounted: notCountedApproved(approvedByInstance, thisDevice),
    }
}

/** What this device keeps of the history key, read together. */
export interface HeldWords {
    standing: HistoryKeyStanding
    words: string[] | null
    pending: PendingHistoryKey | null
}

/**
 * What the pane offers of the words: shown only where they are the current ones; "Restore history" only off them,
 * and never under the history-reset banner (its "It was me" is the way back); "Replace my words" only holding them,
 * no key of its own pending but a replacement's, whose lost answer is pressed again. `null` before the standing is read.
 */
export function wordsOffers(
    held: HeldWords | null,
    underBanner: boolean,
): { passphraseWords: string[] | null; offersRestore: boolean | null; offersReplace: boolean } {
    const holds = held ? holdsCurrentWords(held.standing) : null
    return {
        passphraseWords: holds && held?.words ? held.words : null,
        offersRestore: holds === null ? null : !holds && !underBanner,
        offersReplace: holds === true && !!held?.words && (!held.pending || held.pending.rearchive === true),
    }
}
