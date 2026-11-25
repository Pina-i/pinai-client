/**
 * What the Door and a waiting seat show of the answering side, as every client reads it: open or waiting for a
 * summoned device, the device named, a code taken only where it can be; a seat's lines and what it offers.
 */
import { describe, expect, it } from "vitest"

import { doorCanApprove, doorState } from "@pinai/domain/models/approval-door"
import type { AnsweringView, ApprovalRequest, SeatsView } from "@pinai/domain/models/approval-handshake"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import { arrivalToTell, type TrustEvent } from "@pinai/domain/models/device-trust"
import { seatCanApprove, seatState } from "@pinai/domain/models/waiting-seat"

const request: ApprovalRequest = {
    id: "r1",
    deviceId: "d2",
    displayName: "Pixel 8",
    approverDeviceId: null,
    createdAt: "2026-11-25T10:00:00Z",
    expiresAt: "2026-11-25T10:10:00Z",
}
const view = (stage: AnsweringView["stage"], change: Partial<AnsweringView> = {}): AnsweringView => ({
    request,
    stage,
    failure: null,
    note: null,
    refused: null,
    ...change,
})
const seats = (change: Partial<SeatsView> = {}): SeatsView => ({ open: [], atDoor: null, seat: null, busy: false, unsettled: false, ...change })

describe("the Door's state", () => {
    it("is shut with nothing asked nor summoned", () => {
        expect(doorState(null, null)).toEqual({ isOpen: false, waiting: false, target: null, device: "A device" })
    })

    it("waits for a summoned device, named or not", () => {
        expect(doorState(null, { deviceId: "d3", displayName: " " })).toMatchObject({ isOpen: true, waiting: true, device: "A device" })
        expect(doorState(null, { deviceId: "d3", displayName: "Mac" })).toMatchObject({ device: "Mac", target: { deviceId: "d3" } })
    })

    it("answers the request over a summons", () => {
        expect(doorState(view("entry"), { deviceId: "d3", displayName: "Mac" })).toMatchObject({
            isOpen: true,
            waiting: false,
            device: "Pixel 8",
            target: { deviceId: "d2", displayName: "Pixel 8" },
        })
    })

    it("takes a whole code at the entry only", () => {
        expect(doorCanApprove(view("entry"), "123456")).toBe(true)
        expect(doorCanApprove(view("entry"), "12345")).toBe(false)
        expect(doorCanApprove(view("working"), "123456")).toBe(false)
        expect(doorCanApprove(null, "123456")).toBe(false)
    })
})

describe("a seat's state", () => {
    const device = {
        device_id: "d2",
        display_name: "Pixel 8",
        paired_at: "2026-11-01T10:00:00Z",
        last_seen_at: "2026-11-24T10:00:00Z",
        revoked_at: null,
        signed_in: false,
        last_active_at: null,
    } as DeviceListEntry
    const now = new Date("2026-11-25T10:02:00Z")
    const day = (iso: string) => iso.slice(0, 10)

    it("offers a refused device no code, whatever it asks", () => {
        const state = seatState({ device, seats: seats({ open: [request] }), kind: "refused", now, day })

        expect(state.answer.kind).toBe("asks-nothing")
        expect(state.takesCode).toBe(false)
        expect(seatCanApprove(state, seats({ open: [request] }), "123456")).toBe(false)
    })

    it("reads when it asked, else when it paired", () => {
        expect(seatState({ device, seats: seats({ open: [request] }), kind: "waiting", now, day }).since).toBe("asked 2 minutes ago")
        expect(seatState({ device, seats: seats(), kind: "waiting", now, day }).since).toBe("paired 2026-11-01")
    })

    it("says a wrong code before this request", () => {
        const state = seatState({ device, seats: seats({ seat: view("entry", { note: "wrong-code" }) }), kind: "waiting", now, day })

        expect(state.note).toBe("That code didn't match — type the new one it shows.")
    })

    it("holds the code while this device's words aren't settled", () => {
        const unsettled = seats({ open: [request], unsettled: true })
        const state = seatState({ device, seats: unsettled, kind: "waiting", now, day })

        expect(state.hold).toBe("This device can't approve yet: it's still finishing setting up your history passphrase.")
        expect(seatCanApprove(state, unsettled, "123456")).toBe(false)
        expect(seatCanApprove(state, seats({ open: [request] }), "123456")).toBe(true)
    })

    it("words a failure, and drops Not mine while the exchange works or once approved", () => {
        const failed = seatState({ device, seats: seats({ seat: view("failed", { failure: "expired" }) }), kind: "waiting", now, day })

        expect(failed.failure).toBe("The request ended before it was done. Nothing was approved.")
        expect(failed.offersNotMine).toBe(true)
        expect(seatState({ device, seats: seats({ seat: view("working") }), kind: "waiting", now, day }).offersNotMine).toBe(false)
        expect(seatState({ device, seats: seats({ seat: view("approved") }), kind: "waiting", now, day }).offersNotMine).toBe(false)
    })
})

describe("a device arriving", () => {
    const event: TrustEvent = { kind: "unapproved-device", deviceId: "d2", displayName: "Pixel 8", rootKey: new Uint8Array([1]), arrived: true }

    it("is told once a run", () => {
        const told = arrivalToTell(event, new Set())

        expect(told).toMatchObject({ deviceId: "d2", displayName: "Pixel 8" })
        expect(arrivalToTell(event, new Set([told!.key]))).toBeNull()
    })

    it("is not a device standing from before this device acted", () => {
        expect(arrivalToTell({ ...event, arrived: false }, new Set())).toBeNull()
    })

    it("is only an unapproved device", () => {
        expect(arrivalToTell({ kind: "device-list-refused", duplicates: [] }, new Set())).toBeNull()
    })
})
