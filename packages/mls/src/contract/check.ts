/** The contract's assertions: a failed one throws, with what was expected. */

import { sameBytes } from "@pinai/domain/models/bytes"

export function check(condition: boolean, what: string): asserts condition {
    if (!condition) throw new Error(`Contract: ${what}`)
}

export function same(actual: Uint8Array, expected: Uint8Array, what: string): void {
    check(sameBytes(actual, expected), what)
}

/** `run` must reject. */
export async function refused(run: () => Promise<unknown>, what: string): Promise<void> {
    try {
        await run()
    } catch {
        return
    }
    throw new Error(`Contract: ${what} was taken`)
}

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

export const fromUtf8 = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

export const hex = (text: string): Uint8Array => Uint8Array.from(text.match(/../g) ?? [], (b) => parseInt(b, 16))
