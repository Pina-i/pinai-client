import { wordsOf } from "@pinai/crypto/recovery-words"
import { describe, expect, it } from "vitest"
import { misspeltWord } from "../src/presentation/pages/onboarding/new-device/words-way/words-way-choices"

const misspelt = (text: string) => misspeltWord(text, wordsOf(text))

describe("misspeltWord", () => {
    it("leaves the word still being typed alone", () => {
        expect(misspelt("abandon abil")).toBeNull()
        expect(misspelt("abandon abil ")).toBe("abil")
        expect(misspelt("abandon lagon ability")).toBe("lagon")
    })

    it("checks every word once all 24 are there", () => {
        const twentyThree = Array.from({ length: 23 }, () => "abandon").join(" ")
        expect(misspelt(`${twentyThree} abou`)).toBe("abou")
        expect(misspelt(`${twentyThree} about`)).toBeNull()
    })
})
