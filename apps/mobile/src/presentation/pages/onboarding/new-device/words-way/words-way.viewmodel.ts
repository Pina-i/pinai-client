import { RECOVERY_WORD_COUNT } from "@pinai/crypto/recovery-words"
import { getStringAsync } from "expo-clipboard"
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from "expo-screen-capture"
import { useEffect, useId } from "react"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useTypedWords } from "@/presentation/hooks/use-typed-words"
import type { WordsWayProps } from "./words-way"
import { misspeltWord } from "./words-way-choices"

/** The 24 words typed or pasted, checked as they come; screenshots blocked while this way is on screen. */
export function useWordsWayViewModel({ active, setUp, onTyping, onIn }: WordsWayProps) {
    const typed = useTypedWords({ ready: setUp, onBusy: onTyping, onKept: onIn })
    const key = useId()

    useEffect(() => {
        if (!active) return
        void preventScreenCaptureAsync(key)
        return () => void allowScreenCaptureAsync(key)
    }, [active, key])

    return {
        text: typed.text,
        setText: typed.setText,
        count: `${typed.words.length} of ${RECOVERY_WORD_COUNT} words`,
        complete: typed.complete,
        misspelt: misspeltWord(typed.text, typed.words),
        checking: typed.checking,
        refusal: typed.refusal,
        bring: () => void typed.bring(),
        paste: () => {
            getStringAsync()
                .then((pasted) => {
                    if (pasted) typed.setText(pasted)
                })
                .catch((error: unknown) => warnE2ee("reading the clipboard", error))
        },
    }
}
