import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { getDeviceDirectoryPort, getE2eePort, getHistoryArchivePort, getSessionPort } from "@/ioc"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { useAppStore } from "@/store/store"

export type SetupStatus = "checking" | "running" | "done" | "error"

export interface RecoverySetupViewModel {
    status: SetupStatus
    words: string[]
    error: string | null
    onCopy: () => void
    onContinue: () => void
    onSkip: () => void
    onRetry: () => void
}

/**
 * Runs the first device's bootstrap on mount, then shows the 24 words — only once the IdP took
 * the history key they give. A device that finds the account has a key another device set goes to
 * the restore page instead. Continue and Skip both navigate to /home.
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
        ;(async () => {
            let kept: string[] | null = null
            try {
                const port = getE2eePort()
                // Words kept already (a reload after setup) are only checked; the loader shows either way.
                kept = await port.loadStoredPassphrase()
                if (cancelled) return
                setStatus(kept ? "checking" : "running")
                const outcome = await bootstrapFirstDeviceUseCase({
                    e2eePort: port,
                    sessionPort: getSessionPort(),
                    historyArchivePort: getHistoryArchivePort(),
                    deviceDirectoryPort: getDeviceDirectoryPort(),
                })({
                    idpUrl,
                    accessToken,
                    actorUri: ownActorUri,
                })
                if (cancelled) return
                if (outcome.kind === "has-key") {
                    void navigate({ to: "/onboarding/recovery-restore" })
                    return
                }
                setWords(outcome.words)
                setStatus("done")
            } catch (e) {
                if (cancelled || (await signInAgainOnDeviceMismatch(e))) return
                // The IdP took these words already: an IdP out of reach doesn't take them back.
                if (kept) {
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
        }
    }, [signedIn, idpUrl, ownActorUri, attemptNonce, navigate])

    const onCopy = useCallback(() => {
        if (words.length === 0) return
        const text = words.join(" ")
        navigator.clipboard.writeText(text).then(
            () => toast.success("Passphrase copied"),
            () => toast.error("Could not copy — write the words down manually"),
        )
    }, [words])

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

    return { status, words, error, onCopy, onContinue, onSkip, onRetry }
}
