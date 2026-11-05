import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

import { replaceWordsUseCase, type WordsReplacement } from "@pinai/domain/usecases/e2ee/replace-words.usecase"
import { getE2eePort, getHistoryArchivePort, getKeySharePort, getSessionPort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { rearchiveDueHistory } from "@/presentation/_libs/history-rearchive"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"
import { pendingKeyLock } from "@/presentation/_libs/pending-key-lock"
import { replayRestoredHistory } from "@/presentation/_libs/replay-restored-history"
import { accessTokenArrivedAt } from "@/presentation/_libs/session-renewal"
import type { RecentSignIn } from "@/presentation/hooks/use-recent-sign-in"
import { useAppStore } from "@/store/store"

export interface ReplaceWordsViewModel {
    confirming: boolean
    replacing: boolean
    /** What went otherwise than asked, said in the confirmation. */
    error: string | null
    /** Until Continue: after a replacement, or a reload before Continue. */
    newWords: string[] | null
    /** The card's button, where the focus comes back after Continue. */
    replaceRef: RefObject<HTMLButtonElement | null>
    open: () => void
    cancel: () => void
    confirm: () => void
    onContinue: () => void
}

const WENT_OTHERWISE: Record<Exclude<WordsReplacement["kind"], "replaced" | "recent-sign-in">, string> = {
    conflict: "Another of your devices set new words at the same moment, so yours weren't replaced.",
    "key-changed": "Your words were replaced, then another of your devices set newer ones: those are your words now.",
    "rolled-back": "Your instance went back to an older history key. Only your instance can put it back.",
    "not-acting": "This device doesn't hold your current words any more, so it can't replace them.",
    "restore-due": "Your history is still being brought to this device. Replace your words once it's back.",
    "cache-unread": "This device hasn't finished reading its own history. Reload Pīna'i, then try again.",
    "restore-failed": "Your history backup couldn't be brought onto this device first, so nothing was replaced. Try again.",
}

/** The password is asked before anything is minted; the re-archive starts behind the new words. */
export function useReplaceWordsViewModel(recentSignIn: RecentSignIn, onSettled: () => void): ReplaceWordsViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const [confirming, setConfirming] = useState(false)
    const [replacing, setReplacing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [newWords, setNewWords] = useState<string[] | null>(null)
    const running = useRef(false)
    const shown = useRef(false)
    const replaceRef = useRef<HTMLButtonElement | null>(null)
    const { ask } = recentSignIn

    // New words nobody went past — a reload before Continue — are shown again.
    useEffect(() => {
        let cancelled = false
        void getE2eePort()
            .newWordsToShow()
            .then((unseen) => {
                if (!cancelled && unseen) setNewWords(unseen.words)
            })
            .catch((e: unknown) => warnE2ee("reading the new words to show", e))
        return () => {
            cancelled = true
        }
    }, [])

    // After the dialog's own focus restore, whose target went with the confirmation.
    useEffect(() => {
        if (newWords !== null) {
            shown.current = true
            return
        }
        if (!shown.current) return
        shown.current = false
        const timer = setTimeout(() => replaceRef.current?.focus(), 0)
        return () => clearTimeout(timer)
    }, [newWords])

    const open = useCallback(() => {
        setError(null)
        setConfirming(true)
    }, [])

    const cancel = useCallback(() => {
        if (!running.current) setConfirming(false)
    }, [])

    const showWords = useCallback(
        (words: string[]) => {
            setConfirming(false)
            setNewWords(words)
            void rearchiveDueHistory()
            onSettled()
        },
        [onSettled],
    )

    const confirm = useCallback(() => {
        const accessToken = useAppStore.getState().accessToken
        if (!idpUrl || !accessToken || !actorUri || running.current) return
        running.current = true
        setReplacing(true)
        setError(null)
        void (async () => {
            try {
                const outcome = await replaceWordsUseCase({
                    ...admissionDeps(),
                    sessionPort: getSessionPort(),
                    historyArchivePort: getHistoryArchivePort(),
                    keySharePort: getKeySharePort(),
                    report: warnE2ee,
                    pendingKeyLock: pendingKeyLock(actorUri),
                    cacheRead: () => useAppStore.persist.hasHydrated(),
                    applyRestored: replayRestoredHistory,
                })({ idpUrl, accessToken, actorUri, tokenArrivedAt: accessTokenArrivedAt(accessToken) })
                if (outcome.kind === "replaced") {
                    showWords(outcome.words)
                } else if (outcome.kind === "recent-sign-in") {
                    setConfirming(false)
                    ask("replace your words")
                } else {
                    if (outcome.kind === "restore-failed") warnE2ee("bringing the history backup onto this device", outcome.error)
                    setError(WENT_OTHERWISE[outcome.kind])
                    onSettled()
                }
            } catch (e) {
                if (await signInAgainOnDeviceMismatch(e)) return
                warnE2ee("replacing the words", e)
                const unseen = await getE2eePort()
                    .newWordsToShow()
                    .catch(() => null)
                if (unseen) showWords(unseen.words)
                else setError("Couldn't replace your words: your instance didn't answer. Try again.")
            } finally {
                running.current = false
                setReplacing(false)
            }
        })()
    }, [idpUrl, actorUri, ask, showWords, onSettled])

    const onContinue = useCallback(() => setNewWords(null), [])

    return { confirming, replacing, error, newWords, replaceRef, open, cancel, confirm, onContinue }
}
