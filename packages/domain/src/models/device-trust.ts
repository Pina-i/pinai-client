/**
 * Which of the account's devices this device trusts, decided by itself (`identity-provider/specs/e2ee.md
 * § 3.9`): the approvals it verified, whether it may act on them, which leaves it commits out, and
 * what it keeps so the instance can't take it back (`device_trust`, § 8).
 */

import { hexOf, sameBytes } from "./bytes"
import type { DeviceId } from "./e2ee"
import type { CurrentHistoryKey, HistoryKeyStanding } from "./history-key"
import { leafOrigin, type LeafVerdict, type OwnLeafRefusal, type UntrustedLeaf } from "./leaf-trust"

/** A device as its root key makes it: the same id under another root key is another device. */
export interface KnownDevice {
    deviceId: DeviceId
    rootKey: Uint8Array
}

export function sameDevice(a: KnownDevice, b: KnownDevice): boolean {
    return a.deviceId === b.deviceId && sameBytes(a.rootKey, b.rootKey)
}

/**
 * A device this one approved in a code handshake, and that approved it back (§ 3.10), with the
 * keys the exchange gave — never the list's: the one device a device without the passphrase
 * trusts, and the only ones it shares the passphrase with.
 */
export interface HandshakePartner extends KnownDevice {
    hpkeKey: Uint8Array
}

export function samePartner(a: HandshakePartner, b: HandshakePartner): boolean {
    return sameDevice(a, b) && sameBytes(a.hpkeKey, b.hpkeKey)
}

/** What this device keeps of the account's devices. Each part only grows. */
export interface DeviceTrust {
    /** Seen while this device acted on approval: one is told as arriving once. */
    seen: KnownDevice[]
    /** Found approved, over the root key they were approved over. */
    approved: KnownDevice[]
    /** Revocations seen: final, whatever the list shows later. */
    revoked: DeviceId[]
    /** Approved both ways in a code handshake. */
    partners: HandshakePartner[]
}

export type DeviceTrustRow = keyof DeviceTrust

export const DEVICE_TRUST_ROWS: readonly DeviceTrustRow[] = ["seen", "approved", "revoked", "partners"]

export function emptyDeviceTrust(): DeviceTrust {
    return { seen: [], approved: [], revoked: [], partners: [] }
}

/** `trust` with what `change` adds; the very same object when it adds nothing. */
export function withTrust(trust: DeviceTrust, change: Partial<DeviceTrust>): DeviceTrust {
    const seen = withDevices(trust.seen, change.seen ?? [], sameDevice)
    const approved = withDevices(trust.approved, change.approved ?? [], sameDevice)
    const partners = withDevices(trust.partners, change.partners ?? [], samePartner)
    const newlyRevoked = [...new Set(change.revoked ?? [])].filter((id) => !trust.revoked.includes(id))
    if (seen === trust.seen && approved === trust.approved && partners === trust.partners && newlyRevoked.length === 0) {
        return trust
    }
    return {
        seen,
        approved,
        revoked: newlyRevoked.length === 0 ? trust.revoked : [...trust.revoked, ...newlyRevoked],
        partners,
    }
}

function withDevices<T>(held: T[], more: readonly T[], same: (a: T, b: T) => boolean): T[] {
    const added: T[] = []
    for (const device of more) {
        if (!held.some((d) => same(d, device)) && !added.some((d) => same(d, device))) added.push(device)
    }
    return added.length === 0 ? held : [...held, ...added]
}

/**
 * A listed device's chain JWKS → attestation → root key (§ 3.3). `unsettled` — its issuer out of
 * reach, or its attestation expired — decides nothing either way.
 */
export type ChainCheck = "ok" | "failed" | "unsettled"

/**
 * A listed approval, its signature checked over the device's listed root key: under the approval
 * key this device derived itself, or under the root key listed for the approving device.
 */
export type CheckedApproval =
    | { by: "passphrase"; generation: number; verifies: boolean }
    | { by: "device"; approver: DeviceId; approverRootKey: Uint8Array | null; verifies: boolean }

/** A listed device as this device checked it. */
export interface CheckedDevice {
    deviceId: DeviceId
    displayName: string
    rootKey: Uint8Array | null
    /** As the list says; a revocation seen before counts too, wherever it is asked. */
    revoked: boolean
    chain: ChainCheck
    approvals: CheckedApproval[]
}

/** The ids a list names more than once: such a list is refused whole, as any lookup by id could pick either row. */
export function duplicateDeviceIds(ids: readonly DeviceId[]): DeviceId[] {
    return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))]
}

/**
 * Who acts on approval: a device holding the current passphrase, its own derivation of the
 * approval key the stored one — what `holds` says. Any other decides nothing.
 */
export function actsOnApproval(standing: HistoryKeyStanding): standing is Extract<HistoryKeyStanding, { kind: "holds" }> {
    return standing.kind === "holds"
}

/**
 * The devices approved under `generation`, each over its listed root key: a chain that verifies,
 * no revocation, and an approval by the generation's approval key — or by such a device, by its id
 * and the root key it was approved over. Two links at most; none from a list naming an id twice.
 */
export function approvedDevices(
    devices: readonly CheckedDevice[],
    generation: number,
    revokedSeen: readonly DeviceId[],
): KnownDevice[] {
    if (duplicateDeviceIds(devices.map((d) => d.deviceId)).length > 0) return []
    const standing = devices.flatMap((d) =>
        d.chain === "ok" && d.rootKey !== null && !d.revoked && !revokedSeen.includes(d.deviceId)
            ? [{ ...d, rootKey: d.rootKey }]
            : [],
    )
    const roots = standing.filter((d) =>
        d.approvals.some((a) => a.by === "passphrase" && a.verifies && a.generation === generation),
    )
    const byRoot = (d: KnownDevice, a: CheckedApproval) =>
        a.by === "device" &&
        a.verifies &&
        a.approver !== d.deviceId &&
        a.approverRootKey !== null &&
        roots.some((r) => r.deviceId === a.approver && sameBytes(r.rootKey, a.approverRootKey as Uint8Array))
    return standing
        .filter((d) => roots.includes(d) || d.approvals.some((a) => byRoot(d, a)))
        .map((d) => ({ deviceId: d.deviceId, rootKey: d.rootKey }))
}

/** What a review of the device list found. */
export interface DeviceTrustVerdict {
    /** This device acts on approval: it holds the current passphrase and its derivation is the stored key. */
    acting: boolean
    /** The generation it acted under: a verdict from another one is stale. `null` when it doesn't act. */
    generation: number | null
    thisDevice: DeviceId
    /** Every listed device with a root key, as listed. */
    listed: KnownDevice[]
    /** Approved over their listed root keys, this device among them; none when it doesn't act. */
    approved: KnownDevice[]
    /** Listed, their chain unsettled: neither added nor committed out. */
    unsettled: KnownDevice[]
}

export function undecided(thisDevice: DeviceId, listed: KnownDevice[] = [], unsettled: KnownDevice[] = []): DeviceTrustVerdict {
    return { acting: false, generation: null, thisDevice, listed, approved: [], unsettled }
}

/** A listed device, its chain verifying, unrevoked and unapproved; `arrived` the first time this device sees it under that root key. */
export interface UnapprovedDevice extends KnownDevice {
    displayName: string
    arrived: boolean
}

/**
 * What a review by a device acting on approval finds and keeps: the approved devices, itself
 * among them; the unsettled; every device still unapproved, told as arriving only the first time;
 * the devices seen and found approved, to keep.
 */
export function judgeDevices(input: {
    devices: readonly CheckedDevice[]
    generation: number
    trust: DeviceTrust
    thisDevice: DeviceId
    ownRootKey: Uint8Array | null
}): { approved: KnownDevice[]; unsettled: KnownDevice[]; unapproved: UnapprovedDevice[]; keep: Partial<DeviceTrust> } {
    const { devices, trust, thisDevice } = input
    const found = approvedDevices(devices, input.generation, trust.revoked)
    const self = input.ownRootKey ? { deviceId: thisDevice, rootKey: input.ownRootKey } : null
    const approved = self && !found.some((d) => sameDevice(d, self)) ? [...found, self] : found
    const known = (chain: ChainCheck) =>
        devices.flatMap((d) => (d.chain === chain && d.rootKey ? [{ deviceId: d.deviceId, rootKey: d.rootKey, d }] : []))
    const settled = known("ok")
    const unapproved = settled
        .filter(({ deviceId, d }) => deviceId !== thisDevice && !d.revoked && !trust.revoked.includes(deviceId))
        .filter((device) => !approved.some((a) => sameDevice(a, device)))
        .map(({ deviceId, rootKey, d }) => ({
            deviceId,
            rootKey,
            displayName: d.displayName,
            arrived: !trust.seen.some((s) => sameDevice(s, { deviceId, rootKey })),
        }))
    return {
        approved,
        unsettled: known("unsettled").map(({ deviceId, rootKey }) => ({ deviceId, rootKey })),
        unapproved,
        keep: { seen: settled.map(({ deviceId, rootKey }) => ({ deviceId, rootKey })), approved: found },
    }
}

/** A leaf of the device's own account, its credential verified (§ 3.4), against the reviewed list. */
export function ownLeafStanding(verdict: DeviceTrustVerdict, leaf: KnownDevice): "trusted" | "unsettled" | OwnLeafRefusal {
    if (verdict.approved.some((d) => sameDevice(d, leaf))) return "trusted"
    if (verdict.unsettled.some((d) => sameDevice(d, leaf))) return "unsettled"
    return verdict.listed.some((d) => sameDevice(d, leaf)) ? "not-approved" : "not-listed"
}

/**
 * What a device does with a leaf of a group it holds (§ 3.4, § 3.9): a forgery goes, whoever the
 * device; an attestation that only expired is warned of and stays; a leaf of its own account goes
 * when an acting device doesn't approve it. What couldn't be settled is left as it is.
 */
export type LeafJudgement =
    | { outcome: "trusted" }
    | { outcome: "unsettled" }
    | { outcome: "warn"; reason: "expired" }
    | { outcome: "remove"; reason: UntrustedLeaf["reason"]; grounds: "forged" | "approval" }

export function judgeLeaf(verdict: LeafVerdict, me: string, trust: DeviceTrustVerdict | null): LeafJudgement {
    if (!verdict.ok) {
        if (leafOrigin(verdict) === "forged") return { outcome: "remove", reason: verdict.reason, grounds: "forged" }
        return verdict.reason === "expired" ? { outcome: "warn", reason: "expired" } : { outcome: "unsettled" }
    }
    if (verdict.actorUri !== me) return { outcome: "trusted" }
    if (!trust?.acting) return { outcome: "unsettled" }
    const standing = ownLeafStanding(trust, verdict)
    if (standing === "trusted" || standing === "unsettled") return { outcome: standing }
    return { outcome: "remove", reason: standing, grounds: "approval" }
}

/** The leaf to commit out next: the first judged to go that the instance hasn't refused for good. */
export function firstToCommitOut<T extends { judgement: LeafJudgement; refused: boolean }>(
    leaves: readonly T[],
): (T & { judgement: Extract<LeafJudgement, { outcome: "remove" }> }) | null {
    for (const leaf of leaves) {
        if (leaf.judgement.outcome === "remove" && !leaf.refused) {
            return leaf as T & { judgement: Extract<LeafJudgement, { outcome: "remove" }> }
        }
    }
    return null
}

/** A generation set past the one this device holds — or, holding none, past the newest it had seen. */
export interface HistoryReset {
    generation: number
    setByDevice: DeviceId | null
}

export function resetSince(key: CurrentHistoryKey | null, held: number | null, seenBefore: number | null): HistoryReset | null {
    const before = held ?? seenBefore
    if (!key || before === null || key.generation <= before) return null
    return { generation: key.generation, setByDevice: key.setByDevice }
}

/**
 * Whether a reset came from a device this one never found approved over the root key listed for
 * it now, or from one it can't tell — gone from the list, revoked, unnamed —, or names this very
 * device though it set no such generation: `set_by_device` is the instance's word.
 */
export function resetByUnapproved(
    reset: HistoryReset,
    listed: readonly KnownDevice[],
    trust: DeviceTrust,
    thisDevice: DeviceId,
    pendingGeneration: number | null,
): boolean {
    const setter = reset.setByDevice
    if (setter === thisDevice) return pendingGeneration !== reset.generation
    if (setter === null || trust.revoked.includes(setter)) return true
    const now = listed.find((d) => d.deviceId === setter)
    return !now || !trust.approved.some((d) => sameDevice(d, now))
}

/**
 * The key under the very generation this device holds isn't the one its words give: the approval
 * key alone (`approval-key-differs`), or the salt or check value (`key-replaced`) — the instance
 * changed it.
 */
export function keyChangedUnder(
    standing: HistoryKeyStanding,
): Extract<TrustEvent, { kind: "approval-key-differs" | "key-replaced" }> | null {
    if (standing.kind !== "mismatch" || standing.held !== standing.generation) return null
    if (standing.reason === "approval-key") return { kind: "approval-key-differs", generation: standing.generation }
    if (standing.reason === "check-value") return { kind: "key-replaced", generation: standing.generation }
    return null
}

/** Why a handshake's peer was refused: its keys against its listed row, or its chain JWKS → attestation → root key. */
export type HandshakeKeysRefusal = "not-listed" | "revoked" | "root-key" | "hpke-key" | "attestation"

/** What a device's user is to be told: each stands until what it is about changes. */
export type TrustEvent =
    | { kind: "unapproved-device"; deviceId: DeviceId; displayName: string; rootKey: Uint8Array; arrived: boolean }
    | { kind: "reset-by-unapproved"; generation: number; setByDevice: DeviceId | null }
    | { kind: "approval-key-differs"; generation: number }
    | { kind: "key-replaced"; generation: number }
    | { kind: "device-list-refused"; duplicates: DeviceId[] }
    | { kind: "untrusted-leaf"; leaf: UntrustedLeaf }
    /** A code handshake's peer whose keys the list doesn't show for it, or whose chain doesn't verify. */
    | { kind: "handshake-keys-refused"; deviceId: DeviceId; reason: HandshakeKeysRefusal }

/** What an event is about: a second one about the same thing replaces it. */
export function trustEventKey(event: TrustEvent): string {
    switch (event.kind) {
        case "unapproved-device":
            return `device:${event.deviceId}:${hexOf(event.rootKey)}`
        case "reset-by-unapproved":
            return `reset:${event.generation}`
        case "approval-key-differs":
        case "key-replaced":
            return `key:${event.generation}`
        case "device-list-refused":
            return "list"
        case "untrusted-leaf":
            return `leaf:${event.leaf.conversationId}:${event.leaf.leafIndex}`
        case "handshake-keys-refused":
            return `handshake:${event.deviceId}`
    }
}
