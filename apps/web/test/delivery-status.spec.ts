import { describe, expect, it } from "vitest"
import {
    applyFederationStatus,
    awaitsResend,
    reconcileOptimistic,
    resentCopies,
    SEND_TIMEOUT_MS,
    settleStaleSend,
    type SendState,
} from "@pinai/domain/models/dm"

type Row = SendState & { id: string }

const AT = "2026-09-25T10:00:00.000Z"

describe("applyFederationStatus", () => {
    it("marks a sent message undelivered when the IdP could not deliver it", () => {
        const sent: Row = { id: "m1", status: "sent", statusAt: "2026-09-25T09:00:00.000Z" }

        expect(applyFederationStatus(sent, "failed", AT)).toEqual({ id: "m1", status: "undelivered", statusAt: AT })
    })

    it("overrides a message still waiting on its send", () => {
        expect(applyFederationStatus<Row>({ id: "m1", status: "sending" }, "failed", AT).status).toBe("undelivered")
    })

    it("leaves a message untouched while delivery is pending or succeeded", () => {
        const sent: Row = { id: "m1", status: "sent" }

        expect(applyFederationStatus(sent, "pending", AT)).toBe(sent)
        expect(applyFederationStatus(sent, "delivered", AT)).toBe(sent)
    })

    it("keeps an undelivered message as is, including its resend marker", () => {
        const resent: Row = { id: "m1", status: "undelivered", statusAt: "2026-09-25T09:00:00.000Z", resent: true }

        expect(applyFederationStatus(resent, "failed", AT)).toBe(resent)
    })
})

describe("awaitsResend", () => {
    it("offers to resend a message the IdP never accepted", () => {
        expect(awaitsResend({ status: "failed" })).toBe(true)
    })

    it("offers to resend an undelivered message until it was sent again", () => {
        expect(awaitsResend({ status: "undelivered" })).toBe(true)
        expect(awaitsResend({ status: "undelivered", resent: true })).toBe(false)
    })

    it("offers nothing for a message on its way or delivered", () => {
        expect(awaitsResend({ status: "sending" })).toBe(false)
        expect(awaitsResend({ status: "sent" })).toBe(false)
        expect(awaitsResend({})).toBe(false)
    })
})

describe("settleStaleSend", () => {
    const sentAt = Date.parse(AT)

    it("fails a send that waited past the timeout, so it offers a retry", () => {
        const stuck: Row = { id: "m1", status: "sending", statusAt: AT }

        const settled = settleStaleSend(stuck, sentAt + SEND_TIMEOUT_MS)

        expect(settled.status).toBe("failed")
        expect(awaitsResend(settled)).toBe(true)
    })

    it("leaves a send still within the timeout alone", () => {
        const inFlight: Row = { id: "m1", status: "sending", statusAt: AT }

        expect(settleStaleSend(inFlight, sentAt + SEND_TIMEOUT_MS - 1)).toBe(inFlight)
    })

    it("only touches sends", () => {
        const sent: Row = { id: "m1", status: "sent", statusAt: AT }

        expect(settleStaleSend(sent, sentAt + 10 * SEND_TIMEOUT_MS)).toBe(sent)
    })
})

describe("reconcileOptimistic", () => {
    it("keeps the link to the undelivered message the optimistic copy replaced", () => {
        const optimistic: Row = { id: "tmp", status: "sending", resentFrom: "m1" }
        const confirmed: Row = { id: "m2", status: "sent" }

        expect(reconcileOptimistic(optimistic, confirmed)).toEqual({ id: "m2", status: "sent", resentFrom: "m1" })
    })

    it("returns the confirmed copy as is when there is nothing to carry over", () => {
        const confirmed: Row = { id: "m2", status: "sent" }

        expect(reconcileOptimistic<Row>({ id: "tmp", status: "sending" }, confirmed)).toBe(confirmed)
    })
})

describe("resentCopies", () => {
    it("maps each undelivered message to the copy that replaced it", () => {
        const copy: Row = { id: "m2", status: "sent", resentFrom: "m1" }

        const copies = resentCopies<Row>([{ id: "m1", status: "undelivered", resent: true }, copy, { id: "m3" }])

        expect([...copies]).toEqual([["m1", copy]])
    })
})
