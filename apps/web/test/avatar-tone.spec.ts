import { describe, expect, it } from "vitest"
import { avatarToneFor } from "@/presentation/_libs/avatar-tone"

describe("avatarToneFor", () => {
    it("returns the same tone for the same seed", () => {
        expect(avatarToneFor("mika@idp.aotearoa.nz")).toBe(avatarToneFor("mika@idp.aotearoa.nz"))
    })

    it("never hands a person the group tone", () => {
        const seeds = Array.from({ length: 200 }, (_, i) => `user${i}@host${i % 7}.example`)
        expect(seeds.map(avatarToneFor)).not.toContain("sec")
    })

    it("spreads seeds across more than one tone", () => {
        const tones = new Set(["ana", "tama", "lani", "rangi", "mika", "kai", "pua"].map(avatarToneFor))
        expect(tones.size).toBeGreaterThan(1)
    })

    it("handles an empty seed", () => {
        expect(avatarToneFor("")).toBe("acc")
    })
})
