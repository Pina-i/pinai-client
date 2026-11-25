import { IdpError } from "@pinai/domain/models/idp-error"
import { describe, expect, it } from "vitest"
import {
    choiceText,
    endedLine,
    insteadLine,
    startOverRefusalLine,
} from "../src/presentation/pages/onboarding/new-device/start-over-way/start-over-wording"

describe("the Start over way's words", () => {
    it("says what starting over does, and that approved devices are told first", () => {
        const lost = choiceText("lost-everything", null)
        expect(lost.heading).toBe("No device and no words?")
        expect(lost.body).toMatch(/becomes your reference/)
        expect(lost.body).toMatch(/none of them has been used for 7 days\.$/)
        expect(choiceText("not-me", "Pixel 9").body).toMatch(/^Then someone else replaced your words on Pixel 9: it won't be approved/)
        expect(choiceText("unknown-change", null).heading).toBe("Make this device your reference")
    })

    it("words how the last request ended, by why it was asked", () => {
        expect(endedLine(null, "lost-everything", null)).toBeNull()
        expect(endedLine("cancelled", "lost-everything", null)).toMatch(/^One of your devices cancelled your request/)
        expect(endedLine("cancelled", "not-me", "Pixel 9")).toBe(
            "Your request to start over was cancelled. Whoever has Pixel 9 has your password: change it first, then ask again."
        )
        expect(endedLine("superseded", "lost-everything", null)).toMatch(/^One of your approved devices set new words/)
        expect(insteadLine("not-me", null)).toMatch(/a code from the device that replaced your words keeps your history\.$/)
    })

    it("says a refusal in plain words, never the instance's codes", () => {
        expect(startOverRefusalLine(new TypeError("Failed to fetch"), "ask")).toBe("Couldn't reach your instance. Try again.")
        expect(startOverRefusalLine(new IdpError(403, "access_denied", "nope"), "withdraw")).toBe("This device has been signed out of your account.")
        expect(startOverRefusalLine(new IdpError(409, "something_else", "x"), "ask")).toBe("Your instance didn't take the request. Try again later.")
    })
})
