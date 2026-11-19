/** Editing a text field as a browser does, for the name fields' limit: where the text lands, where the caret ends. */
import { act } from "react"

const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!

/** `text` typed or pasted over `input`'s characters [from, to) (UTF-16), the caret after it. */
export async function typeAt(input: HTMLInputElement, text: string, from: number, to = from) {
    const next = input.value.slice(0, from) + text + input.value.slice(to)
    await act(async () => {
        setValue.call(input, next)
        input.setSelectionRange(from + text.length, from + text.length)
        input.dispatchEvent(new Event("input", { bubbles: true }))
    })
}

/**
 * An IME composing at `at`: each step replaces the syllable so far, as Korean jamo do, then the
 * composition ends. `inputAfterEnd` — Firefox's order: the last step's `input` comes after `compositionend`.
 */
export async function composeAt(
    input: HTMLInputElement,
    at: number,
    steps: string[],
    { end = true, inputAfterEnd = false } = {},
) {
    await act(async () => {
        input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }))
    })
    let composing = ""
    for (const [i, step] of steps.entries()) {
        if (inputAfterEnd && i === steps.length - 1) {
            const next = input.value.slice(0, at) + step + input.value.slice(at + composing.length)
            setValue.call(input, next)
            input.setSelectionRange(at + step.length, at + step.length)
            await endComposition(input)
            await act(async () => {
                input.dispatchEvent(new Event("input", { bubbles: true }))
            })
            return
        }
        await typeAt(input, step, at, at + composing.length)
        composing = step
    }
    if (end) await endComposition(input)
}

/** `key` pressed while an IME composes: Chrome's Enter that commits the syllable comes before `compositionend`. */
export async function pressComposing(input: HTMLInputElement, key: string) {
    await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key, isComposing: true, bubbles: true }))
    })
}

export async function endComposition(input: HTMLInputElement) {
    await act(async () => {
        input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }))
    })
}
