import { describe, expect, it } from "vitest"

import { isPassphraseComplete, unknownWord, wordsOf } from "@pinai/crypto/recovery-words"

const TWENTY_FOUR = "abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual"

describe("wordsOf", () => {
    it("takes the words out of what was typed or pasted, whatever the spaces and capitals", () => {
        expect(wordsOf("  Abandon\n ability\tABLE  ")).toEqual(["abandon", "ability", "able"])
        expect(wordsOf("   ")).toEqual([])
        expect(isPassphraseComplete(wordsOf(TWENTY_FOUR.toUpperCase()))).toBe(true)
    })
})

describe("unknownWord", () => {
    it("names the first word that isn't on the list", () => {
        expect(unknownWord(["abandon", "lagoon", "zzz", "qqq"])).toBe("lagoon")
        expect(unknownWord(wordsOf(TWENTY_FOUR))).toBeNull()
    })
})
