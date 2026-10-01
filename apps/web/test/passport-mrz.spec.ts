import { describe, expect, it } from "vitest"
import { passportMrz } from "@/presentation/organisms/PersonProfileModal/_helpers/passport-mrz.helper"

describe("passportMrz", () => {
    it("writes the name and home server, then the handle, in MRZ characters only", () => {
        const [first, second] = passportMrz("Hōkū Mahina", "hoku@pinai.example")

        expect(first.startsWith("P<PNAHOKU<MAHINA<<PINAI<EXAMPLE<")).toBe(true)
        expect(second.startsWith("HOKU<<")).toBe(true)
    })

    it("pads and cuts both lines to 44 characters", () => {
        const [first, second] = passportMrz("A name far longer than any machine-readable zone holds", "a@b.c")

        expect(first).toHaveLength(44)
        expect(second).toHaveLength(44)
        expect(first + second).toMatch(/^[A-Z0-9<]+$/)
    })
})
