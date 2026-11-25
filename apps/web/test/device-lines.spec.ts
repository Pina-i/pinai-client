import { describe, expect, it } from "vitest"

import { failureWording, refusalWording, UNREACHABLE_LINE } from "@pinai/domain/models/approval-wording"
import { shownDeviceName } from "@pinai/domain/models/device"
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
