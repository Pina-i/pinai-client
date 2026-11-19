import { type RefObject, useRef } from "react"

import { fitName } from "@pinai/domain/models/name"

/**
 * A name field held to `max` characters as the IdP counts them (`fitName`): what is typed or pasted
 * past the limit is cut, never the text after it, the caret kept after what stayed. Its handlers go
 * on the input `inputRef` points at.
 */
export function useNameField(
    inputRef: RefObject<HTMLInputElement | null>,
    value: string,
    onValue: (next: string) => void,
    max: number,
) {
    // Rewriting the field mid-composition breaks an IME's syllable: it is fitted once composed.
    const beforeComposition = useRef<string | null>(null)

    function fit(previous: string, next: string) {
        const input = inputRef.current
        const fitted = fitName(previous, next, max, input?.selectionStart ?? undefined)
        if (input && fitted.text !== next) {
            // Written before React does, so the value it commits is already there and the caret stays.
            input.value = fitted.text
            input.setSelectionRange(fitted.caret, fitted.caret)
        }
        onValue(fitted.text)
    }

    return {
        onChange: (next: string) => (beforeComposition.current === null ? fit(value, next) : onValue(next)),
        onCompositionStart: () => {
            beforeComposition.current = value
        },
        onCompositionEnd: () => {
            const previous = beforeComposition.current ?? value
            beforeComposition.current = null
            fit(previous, inputRef.current?.value ?? value)
        },
    }
}
