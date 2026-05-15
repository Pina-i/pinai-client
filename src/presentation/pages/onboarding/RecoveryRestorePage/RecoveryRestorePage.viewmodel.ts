import { useCallback, useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { restoreHistoryFromPassphraseUseCase } from "@/domain/usecases/e2ee/restore-history-from-passphrase.usecase"
import { getE2eePort } from "@/ioc"
import {
    RECOVERY_WORD_COUNT,
    isPassphraseComplete,
} from "@/presentation/molecules/RecoveryPassphraseInput/RecoveryPassphraseInput"
import { useAppStore } from "@/store/store"

export type RestoreStatus = "idle" | "restoring" | "done" | "error"

export interface RecoveryRestoreViewModel {
    status: RestoreStatus
    words: string[]
    setWords: (next: string[]) => void
    canRestore: boolean
    restored: number
    skipped: number
    error: string | null
    onRestore: () => Promise<void>
    onSkip: () => void
}

export function useRecoveryRestorePageViewModel(): RecoveryRestoreViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const accessToken = useAppStore((s) => s.accessToken)
    const navigate = useNavigate()

    const [status, setStatus] = useState<RestoreStatus>("idle")
    const [words, setWords] = useState<string[]>(() =>
        Array.from({ length: RECOVERY_WORD_COUNT }, () => ""),
    )
    const [restored, setRestored] = useState(0)
    const [skipped, setSkipped] = useState(0)
    const [error, setError] = useState<string | null>(null)

    const canRestore = useMemo(() => isPassphraseComplete(words), [words])

    const onRestore = useCallback(async () => {
        if (!idpUrl || !accessToken || !canRestore) return
        setStatus("restoring")
        setError(null)
        try {
            const result = await restoreHistoryFromPassphraseUseCase({
                e2eePort: getE2eePort(),
            })({ idpUrl, accessToken, passphrase: words })
            setRestored(result.restored)
            setSkipped(result.skipped)
            setStatus("done")
            if (result.restored === 0 && result.skipped > 0) {
                toast.error("Wrong passphrase — no entries decrypted")
            } else if (result.restored === 0) {
                toast.message("No history archive found on the server")
            } else {
                toast.success(`Restored ${result.restored} message${result.restored === 1 ? "" : "s"}`)
            }
        } catch (e) {
            setStatus("error")
            setError(e instanceof Error ? e.message : "Restore failed")
        }
    }, [idpUrl, accessToken, canRestore, words])

    const onSkip = useCallback(() => {
        void navigate({ to: "/home" })
    }, [navigate])

    return {
        status,
        words,
        setWords,
        canRestore,
        restored,
        skipped,
        error,
        onRestore,
        onSkip,
    }
}
