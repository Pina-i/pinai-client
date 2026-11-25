import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"

import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { gateThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/gate-this-device.usecase"
import { setUpFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/set-up-first-device.usecase"
import { instanceHost } from "@pinai/domain/models/instance"
import { getDeviceDirectoryPort, getE2eePort, getHistoryArchivePort, getSessionPort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { copyPassphrase } from "@/presentation/_libs/copy-passphrase"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { GATE_PAGES } from "@/presentation/_libs/gate-pages"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"
import { pendingKeyLock } from "@/presentation/_libs/pending-key-lock"
import { useAppStore } from "@/store/store"

/** `new-words`: a start over's words, set and not yet gone past — shown as the restore page shows them. */
export type SetupStatus = "checking" | "running" | "done" | "new-words" | "error"

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
 * Runs the domain's first-device setup (`setUpFirstDeviceUseCase`) on mount and shows what it
 * answers: the 24 words, new words a start over set, or the page the gate decides. Continue and
 * Skip both navigate to /home.
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
        let cancelled = false
        let recheck: ReturnType<typeof setTimeout> | undefined
        void setUpFirstDeviceUseCase({
            e2eePort: getE2eePort(),
            bootstrap: (session) =>
                bootstrapFirstDeviceUseCase({
                    e2eePort: getE2eePort(),
                    sessionPort: getSessionPort(),
                    historyArchivePort: getHistoryArchivePort(),
                    deviceDirectoryPort: getDeviceDirectoryPort(),
                    pendingKeyLock: pendingKeyLock(ownActorUri),
                    report: warnE2ee,
                })(session),
            gateRoute: (session) => gateThisDeviceUseCase(admissionDeps())(session.idpUrl, session.accessToken, session.actorUri),
            signInAgainOnDeviceMismatch,
        })(
            { idpUrl, accessToken, actorUri: ownActorUri },
            (stage) => {
                if (!cancelled) setStatus(stage)
            },
            () => cancelled
        ).then((outcome) => {
            if (cancelled) return
            switch (outcome.kind) {
                case "words":
                    setWords(outcome.words)
                    setStatus("done")
                    return
                case "new-words":
                    setWords(outcome.words)
                    setStatus("new-words")
                    return
                case "retry":
                    recheck = setTimeout(() => setAttemptNonce((n) => n + 1), outcome.afterMs)
                    return
                case "go":
                    void navigate({ to: GATE_PAGES[outcome.route] })
                    return
                case "failed":
                    setStatus("error")
                    setError(outcome.message)
                    return
            }
        })
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
