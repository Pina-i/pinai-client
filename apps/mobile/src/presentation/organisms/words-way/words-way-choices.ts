import { RECOVERY_WORD_COUNT, unknownWord } from "@pinai/crypto/recovery-words"

/**
 * The first word typed that isn't on the list — not the one still being typed, unless all 24 are there. `null` when
 * there is none.
 */
export function misspeltWord(text: string, words: readonly string[]): string | null {
    const settled = /\s$/.test(text) || words.length >= RECOVERY_WORD_COUNT ? words : words.slice(0, -1)
    return unknownWord(settled)
}
