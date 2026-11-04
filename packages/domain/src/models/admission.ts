/**
 * Whether this device is in — let into the app, its KeyPackages published — and, when it isn't,
 * which page the onboarding gate keeps it on (`identity-provider/specs/e2ee.md § 3.6`, § 3.9):
 * there is no way in without approval.
 */

import { sameBytes } from "./bytes"
import type { DeviceListEntry } from "./device"
import { duplicateDeviceIds, type HandshakePartner, type TrustEvent } from "./device-trust"
import type { DeviceId } from "./e2ee"
import type { HistoryKeyStanding } from "./history-key"

/** A handshake partner, its `by: device` approvals of this device, as listed, checked by `@pinai/crypto`. */
export interface CheckedPartner extends HandshakePartner {
    /** One verifies over this device's current root key, under the root key the exchange gave — never the list's. */
    approvesThisDevice: boolean
}

/** What a device without the passphrase is judged on, beside the generation its own check stood on. */
export interface PartnerFacts {
    devices: readonly DeviceListEntry[]
    partners: readonly CheckedPartner[]
    revokedSeen: readonly DeviceId[]
}

export type Admission =
    | { kind: "in"; by: "passphrase" }
    | { kind: "in"; by: "partner"; partner: DeviceId }
    | { kind: "out" }

const OUT: Admission = { kind: "out" }

/** An admission as it was recorded; `null` for anything else. */
export function parseAdmission(value: unknown): Admission | null {
    if (typeof value !== "object" || value === null) return null
    const row = value as Record<string, unknown>
    if (row.kind === "out") return OUT
    if (row.kind !== "in") return null
    if (row.by === "passphrase") return { kind: "in", by: "passphrase" }
    return row.by === "partner" && typeof row.partner === "string" ? { kind: "in", by: "partner", partner: row.partner } : null
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

/** `partners` is `null` when what the device keeps of them can't be read: nothing then lets it in but the passphrase. */
export function deviceAdmission(standing: HistoryKeyStanding, partners: PartnerFacts | null): Admission {
    if (standing.kind === "holds") return { kind: "in", by: "passphrase" }
    // A non-holding device's best judgement: adding it and sharing with it are the acting devices' calls, which verify chains themselves.
    const generation = partnerGeneration(standing)
    if (!partners || generation === null) return OUT
    const { devices, revokedSeen } = partners
    if (duplicateDeviceIds(devices.map((d) => d.device_id)).length > 0) return OUT
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
    return approving ? { kind: "in", by: "partner", partner: approving.deviceId } : OUT
}

/**
 * `new-device`: § 5.2's page, for a device that never held a generation of the account; `reset`:
 * § 5.4's, for one whose words no longer give the key in force.
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

/** A route change re-checks no sooner than this after the last check: one key read per half minute at most. */
export const GATE_RECHECK_SPACING_MS = 30_000

export function routeRechecks(input: { running: boolean; lastAt: number | null; now: number }): boolean {
    return !input.running && (input.lastAt === null || input.now - input.lastAt >= GATE_RECHECK_SPACING_MS)
}

/** A device that turned out mid-session hears it as one of these: it is checked at once, route change or not. */
export function forcesRecheck(event: TrustEvent): boolean {
    return event.kind === "reset-by-unapproved" || event.kind === "key-replaced" || event.kind === "approval-key-differs"
}
