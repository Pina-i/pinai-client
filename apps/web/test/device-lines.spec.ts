import { describe, expect, it } from "vitest"

import { failureWording, refusalWording, UNREACHABLE_LINE } from "@pinai/domain/models/approval-wording"
import { activityLabel, shownDeviceName, type DeviceListEntry } from "@pinai/domain/models/device"
import { instanceHost } from "@pinai/domain/models/instance"
import { passwordAdvice } from "@pinai/domain/models/instance-admin"
import { askedLine } from "@pinai/domain/models/relative-time"

describe("the lines both apps say", () => {
    it("names a device, or says a device", () => {
        expect(shownDeviceName("  Pixel 8 ")).toBe("Pixel 8")
        expect(shownDeviceName("  ")).toBe("A device")
        expect(shownDeviceName(null)).toBe("A device")
    })

    it("says when a request was asked, and where", () => {
        const now = Date.parse("2026-11-25T10:05:00Z")
        expect(askedLine("2026-11-25T10:03:00Z", now, "kauai.studio")).toBe("asked 2 minutes ago · kauai.studio")
        expect(askedLine(Date.parse("2026-11-25T10:05:00Z"), now, "")).toBe("asked just now")
        expect(askedLine("2026-11-25T09:05:00Z", now, "kauai.studio", "signed in")).toBe("signed in 1 hour ago · kauai.studio")
        // A time ahead of this clock is never "in 3 minutes".
        expect(askedLine("2026-11-25T10:08:00Z", now, "")).toBe("asked just now")
    })

    it("reads an instance's host", () => {
        expect(instanceHost("https://idp.alice.com")).toBe("idp.alice.com")
        expect(instanceHost(null)).toBe("")
    })

    it("words a failed exchange and a refused code", () => {
        expect(failureWording("wrong-code", "Pixel 8")).toBe("That code didn't match. A wrong code ends the request: Pixel 8 shows a new one.")
        expect(refusalWording("used-code")).toBe("That code was tried already — type the new one it shows.")
        expect(refusalWording(null)).toBeNull()
        expect(UNREACHABLE_LINE).toBe("Couldn't reach your instance. Try again.")
    })

    it("tells how to change the password, by the instance's mode", () => {
        expect(passwordAdvice("ask-an-admin", "kauai.studio", "theirs too")).toBe(
            "Ask an admin of kauai.studio for a password reset link: it signs every device out, theirs too.",
        )
    })
})

const day = (iso: string) => `day ${iso.slice(0, 10)}`
const row = (over: Partial<DeviceListEntry> = {}): DeviceListEntry => ({
    device_id: "d1",
    display_name: "Pixel 8",
    automatic_name: "Pixel 8",
    chosen_name: null,
    kind: "phone",
    client: "app",
    paired_at: "2026-11-01T10:00:00Z",
    last_seen_at: "2026-11-24T10:00:00Z",
    revoked_at: null,
    signed_in: true,
    last_active_at: "2026-11-25T09:00:00Z",
    drk_public_key: null,
    attestation_signature: null,
    attestation_kid: null,
    attestation_expires_at: null,
    hpke_public_key: null,
    hpke_key_signature: null,
    history_generation: null,
    approvals: [],
    ...over,
})

describe("a device's activity", () => {
    const now = new Date("2026-11-25T10:00:00Z")

    it("reads this device as in use", () => expect(activityLabel({ ...row(), is_current: true }, now, day)).toBe("Active now"))
    it("reads a live session's last use", () => expect(activityLabel(row(), now, day)).toBe("Active 1 hour ago"))
    it("reads a session never renewed", () => expect(activityLabel(row({ last_active_at: null }), now, day)).toBe("Signed in"))
    it("reads a signed-out device", () => expect(activityLabel(row({ signed_in: false, last_active_at: null }), now, day)).toBe("Last seen yesterday"))
    it("dates a revocation as the platform reads dates", () =>
        expect(activityLabel(row({ revoked_at: "2026-11-04T08:00:00Z" }), now, day)).toBe("Revoked day 2026-11-04"))
})
