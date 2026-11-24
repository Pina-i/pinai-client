import { wordlist } from "@scure/bip39/wordlists/english.js"

/** The account's history passphrase: 24 BIP-39 words. */
export const RECOVERY_WORD_COUNT = 24

export const WORDLIST_SET: ReadonlySet<string> = new Set(wordlist)

/** Typed or pasted text as the words it holds: split at any whitespace, lower-cased (capitals don't count). */
export function wordsOf(text: string): string[] {
    return text
        .split(/\s+/)
        .map((word) => word.toLowerCase())
        .filter(Boolean)
}

/** The first of the words that isn't one of the list, `null` when every one is. */
export function unknownWord(words: readonly string[]): string | null {
    return words.find((word) => !WORDLIST_SET.has(word)) ?? null
}

/** Every slot filled with a word of the BIP-39 list: when "Bring my history" may be pressed. */
export function isPassphraseComplete(words: readonly string[]): boolean {
    if (words.length !== RECOVERY_WORD_COUNT) return false
    return words.every((word) => word !== "" && WORDLIST_SET.has(word))
}
