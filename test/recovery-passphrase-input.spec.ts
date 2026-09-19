/**
 * Unit tests for the `RecoveryPassphraseInput` molecule's logic.
 *
 * The project doesn't include `@testing-library/react`, so the
 * rendered behaviour (focus management, per-slot styling, paste
 * fan-out into siblings) is covered by manual QA on the onboarding
 * route. The pure helpers — `isPassphraseComplete`, which gates the
 * page-level "Restore" button — are the parts most worth a regression
 * net here, and they're framework-agnostic.
 */
import { describe, expect, it } from "vitest"

import {
    RECOVERY_WORD_COUNT,
    isPassphraseComplete,
} from "@/presentation/molecules/RecoveryPassphraseInput/RecoveryPassphraseInput.helper"

// 24 known-good BIP-39 words for the happy-path assertions.
const VALID_24 = [
    "abandon", "ability", "able",   "about",    "above",   "absent",
    "absorb",  "abstract","absurd", "abuse",    "access",  "accident",
    "account", "accuse", "achieve", "acid",     "acoustic","acquire",
    "across",  "act",    "action",  "actor",    "actress", "actual",
]

describe("isPassphraseComplete", () => {
    it("returns true for 24 valid BIP-39 words", () => {
        expect(VALID_24).toHaveLength(RECOVERY_WORD_COUNT)
        expect(isPassphraseComplete(VALID_24)).toBe(true)
    })

    it("returns false when any slot is empty", () => {
        const oneEmpty = [...VALID_24]
        oneEmpty[5] = ""
        expect(isPassphraseComplete(oneEmpty)).toBe(false)
    })

    it("returns false when any slot is not in the BIP-39 wordlist", () => {
        const oneTypo = [...VALID_24]
        oneTypo[10] = "accesss" // typo of "access"
        expect(isPassphraseComplete(oneTypo)).toBe(false)
    })

    it("returns false when the array has the wrong length", () => {
        expect(isPassphraseComplete(VALID_24.slice(0, 23))).toBe(false)
        expect(isPassphraseComplete([...VALID_24, "abandon"])).toBe(false)
    })

    it("RECOVERY_WORD_COUNT matches BIP-39 24-word convention", () => {
        expect(RECOVERY_WORD_COUNT).toBe(24)
    })
})
