import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { addressToActorUri } from "@/domain/models/identity"
import { recoverFromPassphraseUseCase } from "@/domain/usecases/e2ee/recover-from-passphrase.usecase"
import { getE2eePort } from "@/ioc"
import {
    RECOVERY_WORD_COUNT,
    isPassphraseComplete,
} from "@/presentation/molecules/RecoveryPassphraseInput/RecoveryPassphraseInput"
import { useAppStore } from "@/store/store"

export type RestoreStatus = "idle" | "checking" | "restoring" | "fresh-bootstrapping"

export interface RecoveryRestoreViewModel {
    /** True when the server has no wrapped MSK for this account (degraded variant). */
    blobMissing: boolean
    /** Loading the server-blob probe; show a placeholder for the right card. */
    probing: boolean
    /** 24-slot state passed to RecoveryPassphraseInput. */
    words: string[]
    setWords: (next: string[]) => void
    canRestore: boolean
    status: RestoreStatus
    onRestore: () => Promise<void>
    onStartFresh: () => Promise<void>
}

const EMPTY_24 = Array.from({ length: RECOVERY_WORD_COUNT }, () => "")

/**
 * Phase 6a — view model for the new-device recovery view.
 *
 * Probes the server for a recovery blob on mount so the right card
 * can branch into the "passphrase input" variant or the degraded
 * "Start fresh only" variant. Restore drives
 * `recoverFromPassphraseUseCase`; Start fresh runs the plain
 * `register()` path. Both navigate to /home on success.
 */
export function useRecoveryRestorePageViewModel(): RecoveryRestoreViewModel {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const userAddress = useAppStore((s) => s.user?.address ?? null)
    const navigate = useNavigate()

    const [words, setWords] = useState<string[]>(EMPTY_24)
    const [status, setStatus] = useState<RestoreStatus>("checking")
    const [blobMissing, setBlobMissing] = useState(false)
    const probedRef = useRef(false)

    // Probe the server once on mount.
    useEffect(() => {
        if (!accessToken || !idpUrl) return
        if (probedRef.current) return
        probedRef.current = true
        let cancelled = false
        ;(async () => {
            try {
                const has = await getE2eePort().hasRecoveryKey(idpUrl, accessToken)
                if (cancelled) return
                setBlobMissing(!has)
                setStatus("idle")
            } catch (e) {
                if (cancelled) return
                // eslint-disable-next-line no-console
                console.warn("hasRecoveryKey probe failed:", e)
                // Treat as missing — the worst case is the user gets
                // the degraded "Start fresh only" variant and can come
                // back later. Far better than wedging the onboarding.
                setBlobMissing(true)
                setStatus("idle")
            }
        })()
        return () => {
            cancelled = true
        }
    }, [accessToken, idpUrl])

    const canRestore =
        status === "idle" && !blobMissing && isPassphraseComplete(words)

    const onRestore = useCallback(async () => {
        if (!accessToken || !idpUrl || !userAddress) return
        const ownActorUri = addressToActorUri(userAddress, idpUrl)
        if (!ownActorUri) return
        setStatus("restoring")
        try {
            await recoverFromPassphraseUseCase({
                e2eePort: getE2eePort(),
            })({
                idpUrl,
                accessToken,
                actorUri: ownActorUri,
                passphrase: words.join(" "),
            })
            // Persist the words locally so the user can retrieve them
            // again from Settings → Devices on this device too.
            await getE2eePort().saveStoredPassphrase(words)
            void navigate({ to: "/home" })
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Restoration failed."
            toast.error(`Restoration failed: ${msg}`)
            setStatus("idle")
        }
    }, [accessToken, idpUrl, userAddress, words, navigate])

    const onStartFresh = useCallback(async () => {
        if (!accessToken || !idpUrl || !userAddress) return
        const ownActorUri = addressToActorUri(userAddress, idpUrl)
        if (!ownActorUri) return
        setStatus("fresh-bootstrapping")
        try {
            await getE2eePort().register(idpUrl, accessToken, ownActorUri)
            void navigate({ to: "/home" })
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Could not start fresh."
            toast.error(msg)
            setStatus("idle")
        }
    }, [accessToken, idpUrl, userAddress, navigate])

    return {
        blobMissing,
        probing: status === "checking",
        words,
        setWords,
        canRestore,
        status,
        onRestore,
        onStartFresh,
    }
}
