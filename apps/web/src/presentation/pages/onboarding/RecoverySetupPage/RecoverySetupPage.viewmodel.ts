import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"

import { firstWordsShownOffline } from "@pinai/domain/models/history-key"
import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { gateThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/gate-this-device.usecase"
import { getDeviceDirectoryPort, getE2eePort, getHistoryArchivePort, getSessionPort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { copyPassphrase } from "@/presentation/_libs/copy-passphrase"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { GATE_PAGES } from "@/presentation/_libs/gate-pages"
import { instanceHost } from "@/presentation/_libs/instance-host"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"
import { pendingKeyLock } from "@/presentation/_libs/pending-key-lock"
import { useAppStore } from "@/store/store"

/** `new-words`: a start over's words, set and not yet gone past — shown as the restore page shows them. */
export type SetupStatus = "checking" | "running" | "done" | "new-words" | "error"

// A pending key written moments ago is left for a later settle; this page tries again until it is.
export const PENDING_RECHECK_MS = 15_000

export interface RecoverySetupViewModel {
    status: SetupStatus
    words: string[]
    error: string | null
    instance: string
    onCopy: () => void
    onContinue: () => void
    onSkip: () => void
    onRetry: () => void
}

/**
 * Runs the first device's bootstrap on mount, then shows the 24 words — only once the IdP took
 * the history key they give. New words a start over set and nobody went past are shown as such.
 * A device that finds the account has a key another device set goes to the page the gate decides
 * instead. Continue and Skip both navigate to /home.
 */
export function useRecoverySetupPageViewModel(): RecoverySetupViewModel {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const ownActorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const navigate = useNavigate()

    const [status, setStatus] = useState<SetupStatus>("checking")
    const [words, setWords] = useState<string[]>([])
    const [error, setError] = useState<string | null>(null)
    const [attemptNonce, setAttemptNonce] = useState(0)

    useEffect(() => {
        const accessToken = useAppStore.getState().accessToken
        if (!accessToken || !idpUrl || !ownActorUri) return
        const port = getE2eePort()
        let cancelled = false
        let recheck: ReturnType<typeof setTimeout> | undefined
        const showNewWords = async () => {
            const unseen = await port.newWordsToShow()
            if (!unseen || cancelled) return false
            setWords(unseen.words)
            setStatus("new-words")
            return true
        }
        ;(async () => {
            let kept: string[] | null = null
            try {
                // Words kept already (a reload after setup) are only checked; the loader shows either way.
                kept = await port.loadStoredPassphrase()
                if (cancelled) return
                setStatus(kept ? "checking" : "running")
                const outcome = await bootstrapFirstDeviceUseCase({
                    e2eePort: port,
                    sessionPort: getSessionPort(),
                    historyArchivePort: getHistoryArchivePort(),
                    deviceDirectoryPort: getDeviceDirectoryPort(),
                    pendingKeyLock: pendingKeyLock(ownActorUri),
                    report: warnE2ee,
                })({
                    idpUrl,
                    accessToken,
                    actorUri: ownActorUri,
                })
                if (cancelled || (await showNewWords())) return
                if (outcome.kind === "has-key") {
                    if (await port.pendingHistoryKey()) {
                        recheck = setTimeout(() => setAttemptNonce((n) => n + 1), PENDING_RECHECK_MS)
                        return
                    }
                    // The gate's own decision, without mounting the app on the way to the device's page.
                    const route = await gateThisDeviceUseCase(admissionDeps())(idpUrl, accessToken, ownActorUri)
                    if (!cancelled) void navigate({ to: GATE_PAGES[route] })
                    return
                }
                setWords(outcome.words)
                setStatus("done")
            } catch (e) {
                if (cancelled || (await signInAgainOnDeviceMismatch(e))) return
                if (await showNewWords().catch(() => false)) return
                // The first device's words, which the IdP took already: an IdP out of reach doesn't take them back.
                const offline = await Promise.all([port.newestHistoryGeneration(), port.pendingHistoryKey()]).then(
                    ([newest, pending]) => firstWordsShownOffline(newest, pending !== null),
                    () => false,
                )
                if (cancelled) return
                if (kept && offline) {
                    setWords(kept)
                    setStatus("done")
                    return
                }
                setStatus("error")
                setError(e instanceof Error ? e.message : "Setup failed.")
            }
        })()
        return () => {
            // Don't gate re-entry with a ref: under strict mode the cleanup runs between two
            // invocations, and a guard would strand the page. A second run sets the same key.
            cancelled = true
            clearTimeout(recheck)
        }
    }, [signedIn, idpUrl, ownActorUri, attemptNonce, navigate])

    const onCopy = useCallback(() => copyPassphrase(words), [words])

    const onContinue = useCallback(() => {
        void navigate({ to: "/home" })
    }, [navigate])

    // The words are kept already either way; the two names are a nudge.
    const onSkip = onContinue

    const onRetry = useCallback(() => {
        setError(null)
        setStatus("running")
        setAttemptNonce((n) => n + 1)
    }, [])

    return { status, words, error, instance: instanceHost(idpUrl), onCopy, onContinue, onSkip, onRetry }
}
