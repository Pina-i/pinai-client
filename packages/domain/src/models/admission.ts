/**
 * Whether this device is in — let into the app, its KeyPackages published — and, when it isn't,
 * which page the onboarding gate keeps it on (`identity-provider/specs/e2ee.md § 3.6`, § 3.9):
 * there is no way in without approval, and no way out for a device of the user's over a reset
 * they didn't make.
 */

import { sameBytes } from "./bytes"
import type { DeviceListEntry } from "./device"
import { duplicateDeviceIds, type HandshakePartner, type TrustEvent } from "./device-trust"
import type { DeviceId } from "./e2ee"
import { PENDING_KEY_FRESH_MS, type HistoryKeyStanding, type PendingHistoryKey } from "./history-key"

/** A handshake partner, its `by: device` approvals of this device, as listed, checked by `@pinai/crypto`. */
export interface CheckedPartner extends HandshakePartner {
    /** One verifies over this device's current root key, under the root key the exchange gave — never the list's. */
    approvesThisDevice: boolean
}

/**
 * The device that set a newer generation, and whether this device found it approved
 * (`IE2eePort.resetSetter`); `self` when the key names this very device, which set no such
 * generation: the instance's word against its own.
 */
export interface ResetSetter {
    deviceId: DeviceId
    approved: boolean
    self: boolean
}

/** What a device without the passphrase is judged on, beside the generation its own check stood on. */
export interface PartnerFacts {
    devices: readonly DeviceListEntry[]
    partners: readonly CheckedPartner[]
    revokedSeen: readonly DeviceId[]
    /** Read only after a newer generation; `null` when no setter can be told. */
    setter: ResetSetter | null
}

/**
 * Why a device holding words of an older key is let in all the same, acting on nothing: a newer
 * generation set by a device it never found approved, or a change none of the user's devices
 * makes. Its banner says which.
 */
export type KeptWordsCause = "reset-by-unapproved" | "unknown-change"

export type Admission =
    | { kind: "in"; by: "passphrase" }
    | { kind: "in"; by: "partner"; partner: DeviceId }
    | { kind: "in"; by: "kept-words"; cause: KeptWordsCause }
    | { kind: "out" }

const OUT: Admission = { kind: "out" }

/** An admission as it was recorded; `null` for anything else. */
export function parseAdmission(value: unknown): Admission | null {
    if (typeof value !== "object" || value === null) return null
    const row = value as Record<string, unknown>
    if (row.kind === "out") return OUT
    if (row.kind !== "in") return null
    if (row.by === "passphrase") return { kind: "in", by: "passphrase" }
    if (row.by === "kept-words") {
        return row.cause === "reset-by-unapproved" || row.cause === "unknown-change" ? { kind: "in", by: "kept-words", cause: row.cause } : null
    }
    return row.by === "partner" && typeof row.partner === "string" ? { kind: "in", by: "partner", partner: row.partner } : null
}

/**
 * A device whose words gave an older key in force (`held`), and whose standing is a mismatch, stays
 * in unless a device it found approved replaced the words: the user's own doing, answered on the
 * reset page. Anything else — a setter it never found approved, or can't tell, a key changed under
 * a generation, gone back, relabelled, a generation said to be its own — pushes no device of the
 * user's out: an attacker with the password, or the instance, could do it again and again. `null`
 * for any other standing.
 */
export function keptWordsCause(standing: HistoryKeyStanding, setter: ResetSetter | null): KeptWordsCause | null {
    if (standing.kind !== "mismatch" || standing.held === null) return null
    if (resetCause(standing) === "unknown-change" || setter?.self) return "unknown-change"
    return replacedByApproved(standing, setter) ? null : "reset-by-unapproved"
}

/** Why a device in by its kept words is, and the device the key names when that one isn't the user's. */
export interface KeptWordsReset {
    cause: KeptWordsCause
    setter: DeviceId | null
}

export function keptWordsReset(admission: Admission, standing: HistoryKeyStanding): KeptWordsReset | null {
    if (admission.kind !== "in" || admission.by !== "kept-words") return null
    const setter = admission.cause === "reset-by-unapproved" && standing.kind === "mismatch" ? standing.setByDevice : null
    return { cause: admission.cause, setter }
}

/**
 * The generation a partner must hold for this device to be in by it: the one its own check stood
 * on, never below the newest seen. `null` when no partner can let it in — a mismatch no start over
 * explains is a lie this device caught, and no partner overrides it.
 */
function partnerGeneration(standing: HistoryKeyStanding): number | null {
    if (standing.kind === "no-passphrase") return standing.generation
    if (standing.kind === "mismatch" && resetCause(standing) === "newer-generation") return standing.generation
    return null
}

/** The device list is read only for a standing a partner can let in. */
export function needsPartners(standing: HistoryKeyStanding): boolean {
    return partnerGeneration(standing) !== null
}

/**
 * `partners` is `null` when what the device keeps of them can't be read: nothing then lets it in
 * but the passphrase, or its kept words over a reset whose setter it can't tell.
 */
export function deviceAdmission(standing: HistoryKeyStanding, partners: PartnerFacts | null): Admission {
    if (standing.kind === "holds") return { kind: "in", by: "passphrase" }
    // Approved by code, it is in by its partner: a share coming late brings no banner back.
    const partner = partnerAdmitting(standing, partners)
    if (partner) return { kind: "in", by: "partner", partner }
    const cause = keptWordsCause(standing, partners?.setter ?? null)
    return cause ? { kind: "in", by: "kept-words", cause } : OUT
}

// A non-holding device's best judgement: adding it and sharing with it are the acting devices' calls, which verify chains themselves.
function partnerAdmitting(standing: HistoryKeyStanding, partners: PartnerFacts | null): DeviceId | null {
    const generation = partnerGeneration(standing)
    if (!partners || generation === null) return null
    const { devices, revokedSeen } = partners
    if (duplicateDeviceIds(devices.map((d) => d.device_id)).length > 0) return null
    const approving = partners.partners.find((partner) => {
        const row = devices.find((d) => d.device_id === partner.deviceId)
        return (
            !!row &&
            row.revoked_at === null &&
            !revokedSeen.includes(partner.deviceId) &&
            row.drk_public_key !== null &&
            sameBytes(row.drk_public_key, partner.rootKey) &&
            row.history_generation === generation &&
            partner.approvesThisDevice
        )
    })
    return approving?.deviceId ?? null
}

/**
 * `new-device`: § 5.2's page, for a device that never held a generation of the account; `reset`:
 * § 5.4's, for one whose words a device it found approved replaced.
 */
export type GateRoute = "app" | "setup" | "new-device" | "reset"

/** A pending key is the first device's, settled by the setup page before anything is checked. */
export type GateFacts = { pending: true } | { pending: false; standing: HistoryKeyStanding; admission: Admission }

export function decideGateRoute(facts: GateFacts): GateRoute {
    if (facts.pending || facts.standing.kind === "no-key") return "setup"
    if (facts.admission.kind === "in") return "app"
    return facts.standing.kind === "mismatch" ? "reset" : "new-device"
}

/**
 * What the reset page says happened: a newer generation set elsewhere, a start over; or a change no
 * start over makes — the key replaced under the same generation, gone back, relabelled —, the
 * instance's doing.
 */
export type ResetCause = "newer-generation" | "unknown-change"

export function resetCause(standing: HistoryKeyStanding): ResetCause | null {
    if (standing.kind !== "mismatch") return null
    const newer = standing.reason === "check-value" && standing.held !== null && standing.generation > standing.held
    return newer ? "newer-generation" : "unknown-change"
}

/**
 * After a newer generation: the label of the device that set it, when this device found it approved
 * (`IE2eePort.resetSetter`) — the user's own device replaced the words, and the page names it. `null`
 * for any other setter, or a label the list doesn't give: the page says "another device".
 */
export function replacedOn(standing: HistoryKeyStanding, setter: ResetSetter | null, devices: readonly DeviceListEntry[]): string | null {
    if (!replacedByApproved(standing, setter) || !setter) return null
    return devices.find((d) => d.device_id === setter.deviceId)?.display_name.trim() || null
}

/** A newer generation set by the very device this one found approved, as the key names it. */
function replacedByApproved(standing: HistoryKeyStanding, setter: ResetSetter | null): boolean {
    if (resetCause(standing) !== "newer-generation" || standing.kind !== "mismatch") return false
    return !!setter?.approved && setter.deviceId === standing.setByDevice
}

/** A route change re-checks no sooner than this after the last check: one key read per half minute at most. */
export const GATE_RECHECK_SPACING_MS = 30_000

export function routeRechecks(input: { running: boolean; lastAt: number | null; now: number }): boolean {
    return !input.running && (input.lastAt === null || input.now - input.lastAt >= GATE_RECHECK_SPACING_MS)
}

/** A device that turned out mid-session hears it as one of these: it is checked at once, route change or not. */
export function forcesRecheck(event: TrustEvent): boolean {
    return event.kind === "reset-by-unapproved" || event.kind === "key-replaced" || event.kind === "approval-key-differs"
}

/**
 * One of those withdrawn — the key back, or held again — is checked at once too, but not while a
 * pending key written in the last `PENDING_KEY_FRESH_MS` waits: this device's own new generation,
 * keeping its words before the row is cleared, would be sent to setup. One left older than that
 * no longer holds the check back.
 */
export function withdrawalRechecks(event: TrustEvent, pending: PendingHistoryKey | null, now: number): boolean {
    if (!forcesRecheck(event)) return false
    if (!pending || pending.mintedAt === null) return true
    const age = now - pending.mintedAt
    return age < 0 || age >= PENDING_KEY_FRESH_MS
}
