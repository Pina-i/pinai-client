import { wordlist } from "@scure/bip39/wordlists/english.js"

export const RECOVERY_WORD_COUNT = 24

export const WORDLIST_SET = new Set(wordlist)

export type SlotStatus = "empty" | "ok" | "unknown"

/**
 * Every slot filled with a word that is in the BIP-39 list. Drives the
 * "Restore" button's enabled state without re-parsing the value array.
 */
export function isPassphraseComplete(words: string[]): boolean {
    if (words.length !== RECOVERY_WORD_COUNT) return false
    return words.every((w) => w !== "" && WORDLIST_SET.has(w))
}
