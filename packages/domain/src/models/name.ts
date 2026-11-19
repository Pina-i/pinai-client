/**
 * A name people type — a device's, a group's, an account's display name — as the IdP takes it: what
 * shows nothing or turns the text around it dropped, the length in characters (code points).
 */

const CONTROL = /\p{Cc}/gu
// The IdP refuses them: they show nothing, or turn the text around them.
const INVISIBLE = /[\u200B\u200E\u200F\u061C\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u2028\u2029\u00AD\u180E\u115F\u1160\u3164\uFFA0\u2800]/gu
const JOINERS_ONLY = /^[\u200C\u200D\s]*$/u

/** `raw` without the characters the IdP refuses in a name, trimmed; null when nothing readable is left. Joiners stay: emoji need them. */
export function readableName(raw: string): string | null {
    const kept = raw.replace(CONTROL, "").replace(INVISIBLE, "").trim()
    return JOINERS_ONLY.test(kept) ? null : kept
}

/** `text`'s length as the IdP counts it: `.length` counts an emoji twice. */
export function nameLength(text: string): number {
    return Array.from(text).length
}

// Firefox before 125 has no `Intl.Segmenter`: there, a cut stays between code points.
const graphemes = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null

function characters(text: string): string[] {
    return graphemes ? Array.from(graphemes.segment(text), ({ segment }) => segment) : Array.from(text)
}

/** `text` cut to `max` code points between whole characters: an emoji of several (a family, a flag, a skin tone) is dropped whole, never split. */
export function cutName(text: string, max: number): string {
    if (nameLength(text) <= max) return text
    let kept = ""
    let length = 0
    for (const character of characters(text)) {
        length += nameLength(character)
        if (length > max) break
        kept += character
    }
    return kept
}

/**
 * A field holding `previous` changed to `next`, held to `max` code points: what was typed or pasted
 * is cut to the room left (`cutName`), never the text after it. `caret`, where the insertion ends in
 * `next` (UTF-16, as `selectionStart`), tells which of repeated characters was typed; without it,
 * the common start and end of the two decide. Answers where the caret goes: after what was kept.
 */
export function fitName(previous: string, next: string, max: number, caret?: number): { text: string; caret: number } {
    // A deletion is never cut, even from a name already too long.
    if (nameLength(next) <= Math.max(max, nameLength(previous))) return { text: next, caret: caret ?? next.length }
    const before = Array.from(previous)
    const after = Array.from(next)
    const end = caret === undefined ? null : Array.from(next.slice(0, caret)).length
    const byCaret = end !== null && end <= after.length && endsWith(before, after.slice(end))
    let suffix = byCaret ? after.length - end : 0
    let prefix = 0
    const shared = Math.min(before.length, after.length)
    while (prefix < shared - suffix && before[prefix] === after[prefix]) prefix++
    if (!byCaret) {
        while (suffix < shared - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++
    }
    const room = max - prefix - suffix
    if (room < 0) {
        const text = cutName(next, max)
        return { text, caret: text.length }
    }
    const head = after.slice(0, prefix).join("") + cutName(after.slice(prefix, after.length - suffix).join(""), room)
    return { text: head + after.slice(after.length - suffix).join(""), caret: head.length }
}

function endsWith(chars: readonly string[], tail: readonly string[]): boolean {
    return tail.length <= chars.length && tail.every((c, i) => chars[chars.length - tail.length + i] === c)
}
