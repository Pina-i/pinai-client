import { wordlist } from "@scure/bip39/wordlists/english.js"

/** The account's history passphrase: 24 BIP-39 words. */
export const RECOVERY_WORD_COUNT = 24

export const WORDLIST_SET: ReadonlySet<string> = new Set(wordlist)

/** Every slot filled with a word of the BIP-39 list: when "Bring my history" may be pressed. */
export function isPassphraseComplete(words: readonly string[]): boolean {
    if (words.length !== RECOVERY_WORD_COUNT) return false
    return words.every((word) => word !== "" && WORDLIST_SET.has(word))
}
