import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { restoreHistoryFromPassphraseUseCase } from "@/domain/usecases/e2ee/restore-history-from-passphrase.usecase"
import { getE2eePort } from "@/ioc"
import {
    RECOVERY_WORD_COUNT,
    isPassphraseComplete,
    type RecoveryPassphraseInputHandle,
} from "@/presentation/molecules/RecoveryPassphraseInput/RecoveryPassphraseInput"
import { useAppStore } from "@/store/store"

export type RestoreStatus = "initializing" | "ready" | "restoring" | "done" | "error"

export interface RecoveryRestoreViewModel {
    status: RestoreStatus
    /** Display name for the welcome chip — falls back to handle, then "you". */
    welcomeName: string
    /** "Chrome on macOS" / "Web client" — decorative chip subtitle. */
    deviceLabel: string
    words: string[]
    setWords: (next: string[]) => void
    /** True when every slot holds a valid BIP-39 word. */
    canRestore: boolean
    /** Number of filled, valid slots — drives the "N / 24" pill. */
    filledCount: number
    restored: number
    skipped: number
    error: string | null
    /** Pass to `<RecoveryPassphraseInput handleRef=...>` so `onPaste` can focus the first slot. */
    inputHandleRef: RefObject<RecoveryPassphraseInputHandle | null>
    onPaste: () => void
    onClear: () => void
    onRestore: () => Promise<void>
    onStartFresh: () => void
}

/**
 * History restore on a new device.
 *
 * Bootstrap (MSK + Device Root Key) runs silently in the background on mount
 * so both "Restore" and "Start fresh" exit with a fully-set-up device. The
 * passphrase is only needed for decrypting the server-side archive — without
 * it the user can still chat, but messages from before today won't follow
 * them here.
 */
export function useRecoveryRestorePageViewModel(): RecoveryRestoreViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const accessToken = useAppStore((s) => s.accessToken)
    const user = useAppStore((s) => s.user)
    const navigate = useNavigate()

    const [status, setStatus] = useState<RestoreStatus>("initializing")
    const [words, setWords] = useState<string[]>(() =>
        Array.from({ length: RECOVERY_WORD_COUNT }, () => ""),
    )
    const [restored, setRestored] = useState(0)
    const [skipped, setSkipped] = useState(0)
    const [error, setError] = useState<string | null>(null)

    // Bootstrap promise — both action handlers await it before running their
    // own work so an impatient user clicking Restore mid-bootstrap doesn't
    // race with the silent register/registerDevice calls.
    const bootstrapRef = useRef<Promise<void> | null>(null)
    const inputHandleRef = useRef<RecoveryPassphraseInputHandle | null>(null)

    const ownActorUri = user?.actor_uri ?? null
    useEffect(() => {
        if (!idpUrl || !accessToken || !ownActorUri) return
        const port = getE2eePort()
        // Already done in a previous mount on the same session — just
        // open the input.
        bootstrapRef.current = (async () => {
            if (await port.hasLocalIdentity()) {
                await port.registerDevice(idpUrl, accessToken, ownActorUri)
                return
            }
            await port.register(idpUrl, accessToken, ownActorUri)
            await port.registerDevice(idpUrl, accessToken, ownActorUri)
        })()
        let cancelled = false
        bootstrapRef.current
            .then(() => {
                if (!cancelled) setStatus("ready")
            })
            .catch((e) => {
                if (cancelled) return
                setStatus("error")
                setError(e instanceof Error ? e.message : "Could not set up this device.")
            })
        return () => {
            cancelled = true
        }
    }, [idpUrl, accessToken, ownActorUri])

    const canRestore = useMemo(() => isPassphraseComplete(words), [words])
    const filledCount = useMemo(
        () => words.reduce((n, w) => (w ? n + 1 : n), 0),
        [words],
    )

    // Reading the clipboard via `navigator.clipboard.readText()` is gated
    // by per-browser permissions (Firefox blocks it on regular pages
    // entirely). Focusing the first slot is universal — the input
    // molecule's own paste handler fans the 24 words across slots when
    // the user hits Ctrl/Cmd-V.
    const onPaste = useCallback(() => {
        inputHandleRef.current?.focusFirstSlot()
        toast.message("Press Ctrl-V (Cmd-V on Mac) to paste your passphrase")
    }, [])

    const onClear = useCallback(() => {
        setWords(Array.from({ length: RECOVERY_WORD_COUNT }, () => ""))
    }, [])

    const onRestore = useCallback(async () => {
        if (!idpUrl || !accessToken || !canRestore) return
        setStatus("restoring")
        setError(null)
        try {
            // Make sure bootstrap finished before we hit the archive.
            // restoreHistoryFromPassphrase doesn't strictly need MSK, but
            // the user is about to land on /home where the rest of the
            // app expects a complete device.
            if (bootstrapRef.current) await bootstrapRef.current

            const result = await restoreHistoryFromPassphraseUseCase({
                e2eePort: getE2eePort(),
            })({ idpUrl, accessToken, passphrase: words })

            setRestored(result.restored)
            setSkipped(result.skipped)

            if (result.restored === 0 && result.skipped > 0) {
                setStatus("ready")
                toast.error("Wrong passphrase — no entries decrypted")
                return
            }

            // Persist the verified passphrase locally so Settings → Devices
            // can reveal it and the history flusher can encrypt new entries.
            await getE2eePort().saveStoredPassphrase(words)
            setStatus("done")
            toast.success(
                result.restored === 0
                    ? "Device set up"
                    : `Restored ${result.restored} message${result.restored === 1 ? "" : "s"}`,
            )
            void navigate({ to: "/home" })
        } catch (e) {
            setStatus("error")
            setError(e instanceof Error ? e.message : "Restore failed")
        }
    }, [idpUrl, accessToken, canRestore, words, navigate])

    const onStartFresh = useCallback(async () => {
        try {
            if (bootstrapRef.current) await bootstrapRef.current
        } catch {
            // Bootstrap failures already surfaced via setStatus("error");
            // navigate anyway so the user isn't stuck — the gate will
            // route them back here next mount if needed.
        }
        void navigate({ to: "/home" })
    }, [navigate])

    const welcomeName =
        user?.display_name?.trim() ||
        user?.preferred_username?.trim() ||
        user?.address?.split("@")[0] ||
        "you"

    const deviceLabel = useMemo(() => summariseUserAgent(), [])

    return {
        status,
        welcomeName,
        deviceLabel,
        words,
        setWords,
        canRestore,
        filledCount,
        restored,
        skipped,
        error,
        inputHandleRef,
        onPaste,
        onClear,
        onRestore: onRestore as () => Promise<void>,
        onStartFresh,
    }
}

/**
 * Coarse browser+OS label mirroring the IdP's server-side UA parser.
 * Decorative — never used as an identifier. Returns "Web client" when
 * nothing matches.
 */
function summariseUserAgent(): string {
    if (typeof navigator === "undefined") return "Web client"
    const ua = navigator.userAgent
    if (!ua) return "Web client"

    const os = ua.includes("Mac OS X") || ua.includes("macOS")
        ? "macOS"
        : ua.includes("Windows")
          ? "Windows"
          : ua.includes("Android")
            ? "Android"
            : ua.includes("iPhone")
              ? "iOS"
              : ua.includes("iPad")
                ? "iPadOS"
                : ua.includes("Linux")
                  ? "Linux"
                  : "this device"

    const browser = ua.includes("Edg/") || ua.includes("Edge/")
        ? "Edge"
        : ua.includes("OPR/") || ua.includes("Opera/")
          ? "Opera"
          : ua.includes("Firefox/")
            ? "Firefox"
            : ua.includes("Chrome/")
              ? "Chrome"
              : ua.includes("Safari/")
                ? "Safari"
                : "Web"

    return `${browser} on ${os}`
}
