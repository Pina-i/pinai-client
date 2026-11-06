import { useCallback, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { restoreHistoryFromPassphraseUseCase } from "@pinai/domain/usecases/e2ee/restore-history-from-passphrase.usecase"
import { getHistoryArchivePort, getKeySharePort, getSessionPort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { restoreDueHistory } from "@/presentation/_libs/history-restore"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"
import {
    RECOVERY_WORD_COUNT,
    isPassphraseComplete,
} from "@/presentation/molecules/RecoveryPassphraseInput/RecoveryPassphraseInput.helper"
import { useAppStore } from "@/store/store"

const REFUSALS = {
    "wrong-passphrase": "Wrong passphrase — these aren't your account's 24 words",
    "key-swapped": "Your instance changed your history key — nothing was restored",
    "no-key": "Your account has no history passphrase yet",
    "rolled-back": "Your instance went back to an older history key — nothing was restored",
    "key-changed": "Your history key changed meanwhile — nothing was restored",
} as const

export interface TypedWords {
    words: string[]
    setWords: (next: string[]) => void
    /** Every slot holds a valid BIP-39 word. */
    canRestore: boolean
    restoring: boolean
    onRestore: () => Promise<void>
    /** Empty fields again: words typed once don't linger for the next look. */
    clear: () => void
}

export interface TypedWordsInput {
    /** Awaited before anything is checked: the screen's own setup of the device. */
    ready?: () => Promise<void> | null
    /** The words are being checked: a share kept meanwhile isn't the screen's to act on. */
    onBusy?: (busy: boolean) => void
    /** Held, the restore settled. */
    onKept: () => void
    /** Neither held nor refused: what went wrong, for the screen to say. */
    onFailed: (message: string) => void
}

/**
 * The 24 words typed — "My 24 words" on the new-device page, "Its 24 words" on the reset page and in
 * the app's banner: checked against the account's key before anything is kept
 * (`restoreHistoryFromPassphraseUseCase`), then the restore, awaited. A refusal is a toast; the words
 * stay typed.
 */
export function useTypedWords({ ready, onBusy, onKept, onFailed }: TypedWordsInput): TypedWords {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const [words, setWords] = useState<string[]>(noWords)
    const [restoring, setRestoring] = useState(false)
    const running = useRef(false)
    const canRestore = useMemo(() => isPassphraseComplete(words), [words])

    const onRestore = useCallback(async () => {
        const accessToken = useAppStore.getState().accessToken
        if (!idpUrl || !accessToken || !actorUri || !canRestore || running.current) return
        running.current = true
        setRestoring(true)
        onBusy?.(true)
        try {
            await ready?.()
            const result = await restoreHistoryFromPassphraseUseCase({
                ...admissionDeps(),
                sessionPort: getSessionPort(),
                historyArchivePort: getHistoryArchivePort(),
                keySharePort: getKeySharePort(),
                report: warnE2ee,
            })({ idpUrl, accessToken, actorUri, passphrase: words })
            if (result.kind !== "kept") {
                toast.error(REFUSALS[result.kind])
                return
            }
            const restore = await restoreDueHistory()
            if (restore.kind === "failed") {
                toast.error("Your history couldn't be brought back", { description: "It's tried again the next time Pīna'i starts." })
            } else {
                const count = restore.kind === "restored" ? restore.messages : 0
                toast.success(count === 0 ? "Device set up" : `Restored ${count} message${count === 1 ? "" : "s"}`)
            }
            onKept()
        } catch (e) {
            if (await signInAgainOnDeviceMismatch(e)) return
            onFailed(e instanceof Error ? e.message : "Restore failed")
        } finally {
            running.current = false
            setRestoring(false)
            onBusy?.(false)
        }
    }, [idpUrl, actorUri, canRestore, words, ready, onBusy, onKept, onFailed])

    const clear = useCallback(() => setWords(noWords()), [])

    return { words, setWords, canRestore, restoring, onRestore, clear }
}

function noWords(): string[] {
    return Array.from({ length: RECOVERY_WORD_COUNT }, () => "")
}
