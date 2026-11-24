import { isPassphraseComplete, wordsOf } from "@pinai/crypto/recovery-words"
import { restoreHistoryFromPassphraseUseCase } from "@pinai/domain/usecases/e2ee/restore-history-from-passphrase.usecase"
import { typeWordsUseCase } from "@pinai/domain/usecases/e2ee/type-words.usecase"
import { useRef, useState } from "react"
import { getHistoryArchivePort, getKeySharePort, getSessionPort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { restoreDueHistory } from "@/presentation/_libs/history-restore"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useAppStore } from "@/store/store"

const REFUSALS = {
    "wrong-passphrase": "Wrong passphrase — these aren't your account's 24 words",
    "key-swapped": "Your instance changed your history key — nothing was restored",
    "no-key": "Your account has no history passphrase yet",
    "rolled-back": "Your instance went back to an older history key — nothing was restored",
    "key-changed": "Your history key changed meanwhile — nothing was restored",
} as const

interface TypedWordsInput {
    /** Awaited before anything is checked: the screen's own setup of the device. */
    ready: () => Promise<void> | null
    /** The words are being checked: a share kept meanwhile isn't the screen's to act on. */
    onBusy: (busy: boolean) => void
    onKept: () => void
}

/**
 * The 24 words typed, over the domain's `typeWordsUseCase`: checked against the account's key before anything is kept.
 * A refusal is said under the field, the words left as typed.
 */
export function useTypedWords({ ready, onBusy, onKept }: TypedWordsInput) {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const [text, setText] = useState("")
    const [checking, setChecking] = useState(false)
    const [refusal, setRefusal] = useState<string | null>(null)
    const running = useRef(false)
    const words = wordsOf(text)
    const complete = isPassphraseComplete(words)

    const bring = async () => {
        const accessToken = useAppStore.getState().accessToken
        if (!idpUrl || !accessToken || !actorUri || !complete || running.current) return
        running.current = true
        setChecking(true)
        setRefusal(null)
        onBusy(true)
        try {
            const result = await typeWordsUseCase({
                restoreFromWords: (session, passphrase) =>
                    restoreHistoryFromPassphraseUseCase({
                        ...admissionDeps(),
                        sessionPort: getSessionPort(),
                        historyArchivePort: getHistoryArchivePort(),
                        keySharePort: getKeySharePort(),
                        report: warnE2ee,
                    })({ ...session, passphrase }),
                restoreDue: restoreDueHistory,
                signInAgainOnDeviceMismatch,
            })({ idpUrl, accessToken, actorUri }, words, ready)
            switch (result.kind) {
                case "refused":
                    setRefusal(REFUSALS[result.reason])
                    return
                case "kept":
                    onKept()
                    return
                case "failed":
                    setRefusal(result.message)
                    return
                case "signing-in-again":
                    return
            }
        } finally {
            running.current = false
            setChecking(false)
            onBusy(false)
        }
    }

    return {
        text,
        setText: (next: string) => {
            setText(next)
            setRefusal(null)
        },
        words,
        complete,
        checking,
        refusal,
        bring,
    }
}
