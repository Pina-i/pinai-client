/** A typed name as the IdP takes it — a device's, a group's, a display name: one rule for all three. */
import { afterEach, describe, expect, it, vi } from "vitest"

import { cutName, fitName, nameLength, readableName } from "@pinai/domain/models/name"

const ZWSP = String.fromCodePoint(0x200b)
const ZWNJ = String.fromCodePoint(0x200c)
const ZWJ = String.fromCodePoint(0x200d)
const FAMILY = String.fromCodePoint(0x1f469, 0x200d, 0x1f467)
const FLAG = String.fromCodePoint(0x1f1f3, 0x1f1ff)
const WAVE = String.fromCodePoint(0x1f44b, 0x1f3fd)

describe("readableName", () => {
    it("drops control characters, and trims what is left", () => {
        expect(readableName(`  Alice${String.fromCodePoint(0x07)}'s crew\n`)).toBe("Alice's crew")
    })

    it.each([
        ["a zero-width space", 0x200b],
        ["a left-to-right mark", 0x200e],
        ["a right-to-left mark", 0x200f],
        ["an Arabic letter mark", 0x061c],
        ["a right-to-left override", 0x202e],
        ["a word joiner", 0x2060],
        ["an invisible plus", 0x2064],
        ["a first strong isolate", 0x2068],
        ["a byte order mark", 0xfeff],
        ["a line separator", 0x2028],
        ["a paragraph separator", 0x2029],
        ["a soft hyphen", 0x00ad],
        ["a Mongolian vowel separator", 0x180e],
        ["a Hangul choseong filler", 0x115f],
        ["a Hangul jungseong filler", 0x1160],
        ["a Hangul filler", 0x3164],
        ["a halfwidth Hangul filler", 0xffa0],
        ["a blank braille pattern", 0x2800],
    ])("drops %s, which the IdP refuses", (_case, codePoint) => {
        const hidden = String.fromCodePoint(codePoint)
        expect(readableName(`Bob${hidden}'s crew${hidden}`)).toBe("Bob's crew")
        expect(readableName(hidden.repeat(3))).toBeNull()
    })

    it("keeps the joiners emoji are made of", () => {
        expect(readableName(`Alice ${FAMILY}`)).toBe(`Alice ${FAMILY}`)
        expect(readableName(`Bob${ZWNJ}s`)).toBe(`Bob${ZWNJ}s`)
    })

    it("has nothing for a blank name, joiners or whitespace alone", () => {
        expect(readableName("")).toBeNull()
        expect(readableName("   ")).toBeNull()
        expect(readableName(`${ZWJ}${ZWNJ} ${ZWJ}`)).toBeNull()
        expect(readableName(` ${ZWSP} `)).toBeNull()
    })
})

describe("nameLength", () => {
    it("counts characters as the IdP does, an emoji once", () => {
        expect(nameLength("Alice")).toBe(5)
        expect(nameLength("😀".repeat(50))).toBe(50)
    })
})

describe("cutName", () => {
    it("cuts at the limit in code points, never inside an emoji's surrogates", () => {
        expect(cutName("😀".repeat(60), 50)).toBe("😀".repeat(50))
        expect(cutName("a".repeat(49) + "😀😀", 50)).toBe("a".repeat(49) + "😀")
    })

    it.each([
        ["a family, three code points", FAMILY, 3],
        ["a flag, two", FLAG, 2],
        ["a skin tone, two", WAVE, 2],
    ])("drops %s, whole when it would cross the limit", (_case, emoji, size) => {
        const room = "a".repeat(50 - size + 1)
        expect(cutName(room + emoji, 50)).toBe(room)
        expect(cutName("a".repeat(50 - size) + emoji + "b", 50)).toBe("a".repeat(50 - size) + emoji)
    })

    it("leaves a name within the limit as it is", () => {
        expect(cutName("😀".repeat(50), 50)).toBe("😀".repeat(50))
        expect(cutName("Bob's crew", 50)).toBe("Bob's crew")
    })
})

describe("fitName", () => {
    const FULL = "a".repeat(10) + "b".repeat(40)

    it("leaves what fits as it is", () => {
        expect(fitName("Alice", "Alice and Bob", 50, 13)).toEqual({ text: "Alice and Bob", caret: 13 })
    })

    it("refuses a character typed in the middle of a full name, its end kept, the caret where it was", () => {
        const typed = "a".repeat(10) + "X" + "b".repeat(40)
        expect(fitName(FULL, typed, 50, 11)).toEqual({ text: FULL, caret: 10 })
    })

    it("cuts a paste into the middle to the room left, the caret after what was kept", () => {
        const name = "a".repeat(20) + "b".repeat(25)
        const pasted = "a".repeat(20) + "X".repeat(10) + "b".repeat(25)
        expect(fitName(name, pasted, 50, 30)).toEqual({ text: "a".repeat(20) + "X".repeat(5) + "b".repeat(25), caret: 25 })
    })

    it("cuts a paste over a selection to the room the selection leaves", () => {
        const pasted = "a".repeat(10) + "X".repeat(10) + "b".repeat(37)
        expect(fitName(FULL, pasted, 50, 20)).toEqual({ text: "a".repeat(10) + "XXX" + "b".repeat(37), caret: 13 })
    })

    it("tells which of repeated characters was typed by the caret", () => {
        expect(fitName("a".repeat(50), "a".repeat(51), 50, 11)).toEqual({ text: "a".repeat(50), caret: 10 })
    })

    it("finds the insertion by the common start and end without a caret", () => {
        const typed = "a".repeat(10) + "XY" + "b".repeat(40)
        expect(fitName(FULL, typed, 50)).toEqual({ text: FULL, caret: 10 })
    })

    it("keeps an emoji pasted whole or not at all, the caret counted in UTF-16 units", () => {
        const name = "a".repeat(20) + "b".repeat(28)
        const pasted = "a".repeat(20) + "😀😀😀" + "b".repeat(28)
        expect(fitName(name, pasted, 50, 26)).toEqual({ text: "a".repeat(20) + "😀😀" + "b".repeat(28), caret: 24 })
        const family = "a".repeat(20) + FAMILY + "b".repeat(28)
        expect(fitName(name, family, 50, 20 + FAMILY.length)).toEqual({ text: name, caret: 20 })
    })

    it("never cuts a deletion, even from a name already too long", () => {
        const long = "a".repeat(9) + "b".repeat(51)
        const deleted = "a".repeat(9) + "b".repeat(50)
        expect(fitName(long, deleted, 50, 9)).toEqual({ text: deleted, caret: 9 })
        expect(fitName(long, deleted, 50)).toEqual({ text: deleted, caret: deleted.length })
    })

    it("cuts the end of a name that was already too long", () => {
        expect(fitName("a".repeat(60), "a".repeat(60) + "b", 50, 61)).toEqual({ text: "a".repeat(50), caret: 50 })
    })
})

describe("cutName without Intl.Segmenter (Firefox before 125)", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.resetModules()
    })

    it("still loads, and cuts between code points", async () => {
        vi.stubGlobal("Intl", Object.create(Intl, { Segmenter: { value: undefined } }))
        vi.resetModules()
        const fallback = await import("@pinai/domain/models/name")

        expect(fallback.cutName("a".repeat(49) + "😀😀", 50)).toBe("a".repeat(49) + "😀")
        expect(fallback.cutName("a".repeat(49) + FLAG, 50)).toBe("a".repeat(49) + String.fromCodePoint(0x1f1f3))
        expect(fallback.fitName("a".repeat(50), "a".repeat(10) + "X" + "a".repeat(40), 50, 11).text).toBe("a".repeat(50))
    })
})
