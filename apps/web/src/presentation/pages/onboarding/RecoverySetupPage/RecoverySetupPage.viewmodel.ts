import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { bootstrapFirstDeviceUseCase } from "@/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { getE2eePort } from "@/ioc"
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
 * Runs bootstrap on mount, then shows the 24 generated words. Continue
 * and Skip both navigate to /home — the cryptographic state is the same.
 */
export function useRecoverySetupPageViewModel(): RecoverySetupViewModel {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const ownActorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const navigate = useNavigate()

    const [status, setStatus] = useState<SetupStatus>("checking")
    const [words, setWords] = useState<string[]>([])
    const [error, setError] = useState<string | null>(null)
    const [attemptNonce, setAttemptNonce] = useState(0)

    useEffect(() => {
        if (!accessToken || !idpUrl || !ownActorUri) return
        let cancelled = false
        ;(async () => {
            try {
                const port = getE2eePort()
                // Fast path: a passphrase is already stored on this
                // device (hard refresh, or the user navigated back to
                // this route after completing setup once). Skip the
                // full bootstrap so the "Setting up your recovery
                // passphrase…" loader doesn't flash needlessly — that
                // text belongs to the *actual* setup work, not the
                // re-render path.
                const existing = await port.loadStoredPassphrase()
                if (cancelled) return
                if (existing && existing.length === 24) {
                    setWords(existing)
                    setStatus("done")
                    return
                }
                // Cold path: real bootstrap — register, generate
                // mnemonic, wrap MSK, upload. This is where the
                // visible loader makes sense.
                setStatus("running")
                const result = await bootstrapFirstDeviceUseCase({
                    e2eePort: port,
                })({
                    idpUrl,
                    accessToken,
                    actorUri: ownActorUri,
                })
                if (cancelled) return
                setWords(result.words)
                setStatus("done")
            } catch (e) {
                if (cancelled) return
                setStatus("error")
                setError(e instanceof Error ? e.message : "Setup failed.")
            }
        })()
        return () => {
            // Cancel this effect's in-flight bootstrap. Don't gate
            // re-entry with a ref — under React strict mode the
            // cleanup runs between two effect invocations on the
            // same mount; a ref-guarded "already ran" check would
            // suppress the second invocation while the first was
            // cancelled, stranding the page at status="running".
            // `bootstrapFirstDeviceUseCase` is idempotent
            // (register/setupRecoveryKey both deduplicate or
            // overwrite), so two passes are safe.
            cancelled = true
        }
    }, [accessToken, idpUrl, ownActorUri, attemptNonce])

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

    // Skip and Continue are functionally identical — the recovery blob
    // is already uploaded and the local copy is already saved. Naming
    // them differently is purely a UX nudge.
    const onSkip = onContinue

    const onRetry = useCallback(() => {
        setError(null)
        setStatus("running")
        setAttemptNonce((n) => n + 1)
    }, [])

    return { status, words, error, onCopy, onContinue, onSkip, onRetry }
}
