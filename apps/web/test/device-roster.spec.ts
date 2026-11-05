/**
 * Settings → Devices' rules (`identity-provider/specs/e2ee.md § 3.9`, § 3.10): who waits for the user
 * — on a device that acts only —, who holds the history and how many, who approved whom — from this
 * device's own verdict, never the list's word —, and what a waiting seat offers.
 */
import { describe, expect, it } from "vitest"

import { seatAnswer, type AnsweringView, type ApprovalRequest, type SeatsView } from "@pinai/domain/models/approval-handshake"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import {
    approvedByWording,
    approverOf,
    fromBeforeDevices,
    refusedDevice,
    historyHolders,
    holdsCurrentWords,
    holdsHistory,
    waitingDevices,
} from "@pinai/domain/models/device-roster"
import {
    approvedDevicesBy,
    undecided,
    type CheckedApproval,
    type CheckedDevice,
    type DeviceTrustVerdict,
    type KnownDevice,
    type TrustEvent,
} from "@pinai/domain/models/device-trust"

const root = (n: number) => new Uint8Array(32).fill(n)

function row(device_id: string, n: number | null, change: Partial<DeviceListEntry> = {}): DeviceListEntry {
    return {
        device_id,
        display_name: device_id,
        kind: "laptop",
        paired_at: "2026-11-01T00:00:00Z",
        last_seen_at: "2026-11-04T00:00:00Z",
        revoked_at: null,
        signed_in: true,
        last_active_at: null,
        drk_public_key: n === null ? null : root(n),
        attestation_signature: null,
        attestation_kid: null,
        attestation_expires_at: null,
        hpke_public_key: null,
        hpke_key_signature: null,
        history_generation: null,
        // Never read here: who approved whom is the verdict's.
        approvals: [{ by: "passphrase", generation: 2, signature: new Uint8Array(64), created_at: "2026-11-01T00:00:00Z" }],
        ...change,
    }
}

const unapproved = (deviceId: string, n: number): TrustEvent => ({
    kind: "unapproved-device",
    deviceId,
    displayName: deviceId,
    rootKey: root(n),
    arrived: false,
})

function verdict(change: Partial<DeviceTrustVerdict> = {}): DeviceTrustVerdict {
    return {
        acting: true,
        generation: 2,
        thisDevice: "laptop",
        listed: [],
        approved: [{ deviceId: "laptop", rootKey: root(1) }],
        approvedBy: [],
        unsettled: [],
        before: null,
        ...change,
    }
}

function request(deviceId: string, id: string, createdAt = "2026-11-05T10:00:00Z"): ApprovalRequest {
    return { id, deviceId, displayName: deviceId, approverDeviceId: null, createdAt, expiresAt: "2026-11-05T10:10:00Z" }
}

describe("who approved whom, as this device verified it", () => {
    const byPassphrase: CheckedApproval = { by: "passphrase", generation: 2, verifies: true }
    const byDevice = (approver: string, n: number, createdAt: string, verifies = true): CheckedApproval => ({
        by: "device",
        approver,
        approverRootKey: root(n),
        verifies,
        createdAt,
    })
    const device = (deviceId: string, n: number, approvals: CheckedApproval[]): CheckedDevice => ({
        deviceId,
        displayName: deviceId,
        rootKey: root(n),
        revoked: false,
        chain: "ok",
        approvals,
    })
    const approvers = (devices: CheckedDevice[]) => approvedDevicesBy(devices, 2, []).map((d) => [d.deviceId, d.approver])

    it("names the device that approved first after a handshake's approvals both ways, then the words for the other", () => {
        // The laptop answered the phone's code, the phone approved it back, then approved itself with the shared words.
        expect(
            approvers([
                device("laptop", 1, [byPassphrase, byDevice("phone", 2, "2026-11-05T10:00:05Z")]),
                device("phone", 2, [byDevice("laptop", 1, "2026-11-05T10:00:01Z"), byPassphrase]),
            ]),
        ).toEqual([
            ["laptop", { by: "passphrase" }],
            ["phone", { by: "device", deviceId: "laptop" }],
        ])
    })

    it("names a device that approved one never approving it back, and the words for one approved by them alone", () => {
        expect(
            approvers([
                device("laptop", 1, [byPassphrase]),
                device("phone", 2, [byPassphrase, byDevice("laptop", 1, "2026-11-05T10:00:01Z")]),
                device("tablet", 3, [byDevice("nobody", 9, "2026-11-05T10:00:01Z"), byPassphrase]),
            ]),
        ).toEqual([
            ["laptop", { by: "passphrase" }],
            ["phone", { by: "device", deviceId: "laptop" }],
            ["tablet", { by: "passphrase" }],
        ])
    })

    it("still names its one approver for a device approved by no words, whatever the order", () => {
        expect(
            approvers([
                device("laptop", 1, [byPassphrase, byDevice("phone", 2, "2026-11-05T10:00:00Z")]),
                device("phone", 2, [byDevice("laptop", 1, "2026-11-05T10:00:00Z")]),
            ]),
        ).toEqual([
            ["laptop", { by: "passphrase" }],
            ["phone", { by: "device", deviceId: "laptop" }],
        ])
    })

    it("counts no approval that doesn't verify, nor one by a device that isn't itself approved", () => {
        const found = approvedDevicesBy(
            [
                device("laptop", 1, [byPassphrase]),
                device("phone", 2, [byDevice("laptop", 1, "2026-11-05T10:00:00Z", false)]),
                device("tablet", 3, [byDevice("phone", 2, "2026-11-05T10:00:00Z")]),
            ],
            2,
            [],
        )

        expect(found.map((d) => d.deviceId)).toEqual(["laptop"])
    })

    it("says “this device”, another device's label or “your 24 words”, from an acting verdict and over the root key listed now", () => {
        const rows = [row("laptop", 1, { display_name: "Firefox on Linux" }), row("phone", 2, { display_name: "Pixel 8" }), row("tablet", 3)]
        const acting = verdict({
            approvedBy: [
                { deviceId: "laptop", rootKey: root(1), approver: { by: "passphrase" } },
                { deviceId: "phone", rootKey: root(2), approver: { by: "device", deviceId: "laptop" } },
                { deviceId: "tablet", rootKey: root(3), approver: { by: "device", deviceId: "phone" } },
            ],
        })
        const said = (verdictNow: DeviceTrustVerdict | null, device: DeviceListEntry) =>
            approvedByWording(approverOf(verdictNow, device), rows, "laptop")

        expect(rows.map((d) => said(acting, d))).toEqual(["your 24 words", "this device", "Pixel 8"])
        expect(said(acting, row("phone", 7))).toBeNull()
        expect(rows.map((d) => said({ ...acting, acting: false }, d))).toEqual([null, null, null])
        expect(said(null, rows[1])).toBeNull()
        expect(said(undecided("laptop"), rows[1])).toBeNull()
    })
})

describe("who holds the history", () => {
    it("counts, on an acting verdict, the devices it approves that say they hold its generation", () => {
        const rows = [
            row("laptop", 1, { history_generation: 3 }),
            row("phone", 2, { history_generation: 3 }),
            row("tablet", 3, { history_generation: 2 }),
            row("old", 4, { history_generation: 3, revoked_at: "2026-10-01T00:00:00Z" }),
            row("unapproved", 5, { history_generation: 3 }),
            row("rekeyed", 6, { history_generation: 3 }),
        ]
        const acting = verdict({
            generation: 3,
            approved: [1, 2, 3, 4].map((n) => ({ deviceId: rows[n - 1].device_id, rootKey: root(n) })).concat({ deviceId: "rekeyed", rootKey: root(9) }),
        })

        expect(rows.map((d) => holdsHistory(d, acting))).toEqual([true, true, false, false, false, false])
        expect(historyHolders(rows, acting)).toBe(2)
        expect(historyHolders(rows, { ...acting, acting: false })).toBe(0)
        expect(historyHolders(rows, null)).toBe(0)
    })

    it("shows the words only while holding the current passphrase", () => {
        expect(holdsCurrentWords({ kind: "holds", generation: 3, settled: true })).toBe(true)
        expect(holdsCurrentWords({ kind: "holds", generation: 3, settled: false })).toBe(true)
        expect(holdsCurrentWords({ kind: "no-passphrase", generation: 3 })).toBe(false)
        expect(holdsCurrentWords({ kind: "unchecked" })).toBe(false)
        expect(holdsCurrentWords({ kind: "mismatch", generation: 4, setByDevice: "x", reason: "check-value", held: 3 })).toBe(false)
    })
})

describe("who waits for the user", () => {
    const rows = [
        row("laptop", 1),
        row("phone", 2, { paired_at: "2026-11-02T00:00:00Z" }),
        row("tablet", 3, { paired_at: "2026-11-04T00:00:00Z" }),
        row("watch", 4),
        row("gone", 5, { revoked_at: "2026-11-03T00:00:00Z" }),
    ]

    it("seats each unapproved device on a device that acts, newest first", () => {
        const events = [unapproved("phone", 2), unapproved("tablet", 3), unapproved("gone", 5)]

        expect(waitingDevices({ devices: rows, events, verdict: verdict(), requests: [] }).map((d) => d.device_id)).toEqual([
            "tablet",
            "phone",
        ])
    })

    it("seats nobody on a device that doesn't act, or before any review", () => {
        const events = [unapproved("phone", 2)]
        const requests = [request("tablet", "r1")]

        expect(waitingDevices({ devices: rows, events, verdict: undecided("laptop"), requests })).toEqual([])
        expect(waitingDevices({ devices: rows, events, verdict: null, requests })).toEqual([])
    })

    it("seats a device asking only before any review judged it; once judged, only its unapproved event does", () => {
        const listed = [1, 2, 4].map((n) => ({ deviceId: rows[n === 4 ? 3 : n - 1].device_id, rootKey: root(n) }))
        const acting = verdict({ listed, approved: [{ deviceId: "laptop", rootKey: root(1) }, { deviceId: "watch", rootKey: root(4) }] })
        const requests = [request("tablet", "r1"), request("watch", "r2"), request("phone", "r3"), request("gone", "r4")]

        // The tablet is new to the last review; the watch it approved, the phone it judged without an event.
        expect(waitingDevices({ devices: rows, events: [], verdict: acting, requests }).map((d) => d.device_id)).toEqual(["tablet"])
        expect(waitingDevices({ devices: rows, events: [unapproved("phone", 2)], verdict: acting, requests }).map((d) => d.device_id)).toEqual([
            "tablet",
            "phone",
        ])
        expect(waitingDevices({ devices: rows, events: [unapproved("phone", 9)], verdict: acting, requests: [] })).toEqual([])
    })
})

describe("the devices from before this device started over", () => {
    const rows = [
        row("laptop", 1),
        row("desktop", 2, { display_name: "Desktop app on Linux", paired_at: "2026-10-02T00:00:00Z" }),
        row("tablet", 3, { display_name: "  ", paired_at: "2026-10-04T00:00:00Z" }),
        row("watch", 4, { paired_at: "2026-11-04T00:00:00Z" }),
        row("gone", 5, { revoked_at: "2026-11-03T00:00:00Z" }),
    ]
    const before = [
        { deviceId: "desktop", rootKey: root(2) },
        { deviceId: "tablet", rootKey: root(3) },
        { deviceId: "gone", rootKey: root(5) },
    ]
    const events = [unapproved("desktop", 2), unapproved("tablet", 3), unapproved("watch", 4), unapproved("gone", 5)]
    const left = (devices = before, refused: KnownDevice[] = []): Partial<DeviceTrustVerdict> => ({
        before: { generation: 2, cause: "start-over", devices, refused },
    })

    it("seats them apart, newest first, and out of who waits — the device that appeared after still waits", () => {
        const acting = verdict(left())

        expect(fromBeforeDevices({ devices: rows, events, verdict: acting }).map((d) => d.device_id)).toEqual(["tablet", "desktop"])
        expect(waitingDevices({ devices: rows, events, verdict: acting, requests: [request("desktop", "r1")] }).map((d) => d.device_id)).toEqual([
            "watch",
        ])
    })

    it("seats one only while its review leaves it unapproved, under the root key kept, on a device that acts", () => {
        expect(fromBeforeDevices({ devices: rows, events: [unapproved("tablet", 3)], verdict: verdict(left()) }).map((d) => d.device_id)).toEqual([
            "tablet",
        ])
        const rotated = rows.map((d) => (d.device_id === "desktop" ? { ...d, drk_public_key: root(9) } : d))
        expect(fromBeforeDevices({ devices: rotated, events: [unapproved("desktop", 9)], verdict: verdict(left()) })).toEqual([])
        // Under another root key it is another device: it waits like any.
        expect(
            waitingDevices({ devices: rotated, events: [unapproved("desktop", 9)], verdict: verdict(left()), requests: [] }).map(
                (d) => d.device_id,
            ),
        ).toEqual(["desktop"])
        expect(fromBeforeDevices({ devices: rows, events, verdict: undecided("laptop") })).toEqual([])
        expect(fromBeforeDevices({ devices: rows, events, verdict: null })).toEqual([])
    })

    it("seats the device the user refused with who waits, apart from the user's from before", () => {
        const watch = { deviceId: "watch", rootKey: root(4) }
        const acting = verdict(left(before, [watch]))

        expect(waitingDevices({ devices: rows, events, verdict: acting, requests: [] }).map((d) => d.device_id)).toEqual(["watch"])
        expect(refusedDevice(acting, rows[3])).toBe(true)
        expect(refusedDevice(acting, { ...rows[3], drk_public_key: root(9) })).toBe(false)
        expect(refusedDevice(verdict({ ...left(before, [watch]), acting: false }), rows[3])).toBe(false)
        expect(fromBeforeDevices({ devices: rows, events, verdict: acting }).map((d) => d.device_id)).not.toContain("watch")
    })
})

describe("what a waiting seat offers", () => {
    const empty: SeatsView = { open: [], atDoor: null, seat: null, busy: false, unsettled: false }
    const view = (change: Partial<AnsweringView>): AnsweringView => ({
        request: request("phone", "r1"),
        stage: "entry",
        failure: null,
        note: null,
        refused: null,
        ...change,
    })

    it("offers the code only for an open request, the newest", () => {
        const older = request("phone", "r1", "2026-11-05T09:00:00Z")
        const newer = request("phone", "r2", "2026-11-05T09:30:00Z")

        expect(seatAnswer("phone", empty)).toEqual({ kind: "asks-nothing" })
        expect(seatAnswer("phone", { ...empty, open: [request("tablet", "r0")] })).toEqual({ kind: "asks-nothing" })
        expect(seatAnswer("phone", { ...empty, open: [older, newer] })).toEqual({ kind: "code", request: newer, note: null, refused: null })
    })

    it("shows a request the Door holds as answered there, not as a code to type", () => {
        const asked = request("phone", "r1")

        expect(seatAnswer("phone", { ...empty, open: [asked], atDoor: asked })).toEqual({ kind: "at-door", request: asked })
        expect(seatAnswer("tablet", { ...empty, open: [asked, request("tablet", "r2")], atDoor: asked }).kind).toBe("code")
    })

    it("follows the exchange a seat started: its code again with a note or a refusal, then under way, approved or failed", () => {
        const at = (stage: AnsweringView["stage"], change: Partial<AnsweringView> = {}) =>
            seatAnswer("phone", { ...empty, seat: view({ stage, ...change }) })

        expect(at("entry", { note: "wrong-code", refused: "used-code" })).toMatchObject({ kind: "code", note: "wrong-code", refused: "used-code" })
        expect(at("working").kind).toBe("working")
        expect(at("approved").kind).toBe("approved")
        expect(at("failed", { failure: "wrong-code" })).toMatchObject({ kind: "failed", failure: "wrong-code" })
        expect(seatAnswer("tablet", { ...empty, seat: view({ stage: "working" }) })).toEqual({ kind: "asks-nothing" })
    })
})
