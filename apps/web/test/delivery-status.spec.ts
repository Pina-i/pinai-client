import { describe, expect, it } from "vitest"
import { applyFederationStatus, awaitsResend, type SendState } from "@pinai/domain/models/dm"

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
