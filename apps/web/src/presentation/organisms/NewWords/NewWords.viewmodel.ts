import { useCallback } from "react"

import { getE2eePort } from "@/ioc"
import { copyPassphrase } from "@/presentation/_libs/copy-passphrase"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"

export interface NewWordsViewModel {
    onCopy: () => void
    onContinue: () => void
}

/** Continue is the user going past the words: they aren't shown again after a reload. */
export function useNewWordsViewModel(words: string[], onContinue: () => void): NewWordsViewModel {
    const onCopy = useCallback(() => copyPassphrase(words), [words])
    const goOn = useCallback(() => {
        void getE2eePort()
            .dismissNewWords()
            .catch((e: unknown) => warnE2ee("forgetting the new words were to be shown", e))
            .finally(onContinue)
    }, [onContinue])
    return { onCopy, onContinue: goOn }
}
