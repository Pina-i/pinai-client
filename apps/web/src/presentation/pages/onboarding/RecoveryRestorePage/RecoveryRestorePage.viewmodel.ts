import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { resetCause, type ResetCause } from "@pinai/domain/models/admission"
import { logoutUseCase } from "@pinai/domain/usecases/auth/logout.usecase"
import { AwaitedShare, type AwaitedShareState } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { checkAdmissionUseCase } from "@pinai/domain/usecases/e2ee/check-admission.usecase"
import { restoreHistoryFromPassphraseUseCase } from "@pinai/domain/usecases/e2ee/restore-history-from-passphrase.usecase"
import { setUpThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/set-up-this-device.usecase"
import { getAuthPlatform, getE2eePort, getHistoryArchivePort, getKeySharePort, getSessionPort } from "@/ioc"
import { acceptWaitingShare } from "@/presentation/_libs/accept-share"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { restoreDueHistory } from "@/presentation/_libs/history-restore"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"
import type { RecoveryPassphraseInputHandle } from "@/presentation/molecules/RecoveryPassphraseInput/RecoveryPassphraseInput"
import {
    RECOVERY_WORD_COUNT,
    isPassphraseComplete,
} from "@/presentation/molecules/RecoveryPassphraseInput/RecoveryPassphraseInput.helper"
import { useAppStore } from "@/store/store"

export type RestoreStatus = "initializing" | "ready" | "restoring" | "done" | "error"

/** § 5.2's page for a device that never held the account's passphrase; § 5.4's for one whose words no longer give it. */
export type RestoreVariant = "new-device" | "reset"

export interface RecoveryRestoreViewModel {
    status: RestoreStatus
    /** Registered and named on its session: it can ask another device to approve it. */
    deviceReady: boolean
    /** Let in already — arrived from Settings → Devices: it may go back. Never a way in. */
    isIn: boolean
    /** What the reset page says happened; `null` until known. */
    resetCause: ResetCause | null
    /**
     * Another device's code and the 24 words can let this device in: never on a reset no start over
     * explains — no device holds the key the instance put in, and the old words are refused.
     */
    offersWayIn: boolean
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
    /** On to the app — approved from another device, or already in —, or to whichever page the gate says. */
    onIn: () => void
    onSignOut: () => void
    /** The wait for this device's key share, from the page set up on; `null` while it holds the words or before. */
    share: AwaitedShareState | null
    /** The code section approved this device: it takes the way on from there. */
    onApproved: () => void
    /** A share failed its checks and no approval here explains it: the page says so and points to the words. */
    shareRefused: boolean
}

/**
 * The pages a device that isn't in stays on: no way in but another device's approval or the 24
 * words — or signing out. The device is set up on mount — registered and named on its session, no
 * KeyPackage published —, then whether it is in read; lacking the words, it reads its key share on
 * the entry's backoff, and kept goes on to the app, the archive coming back behind it. Typed words
 * are checked against the account's history key before anything is kept; right, the device approves
 * itself with them, reports its generation and publishes its KeyPackages, then the archive is restored.
 */
export function useRecoveryRestorePageViewModel(variant: RestoreVariant = "new-device"): RecoveryRestoreViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const accessToken = useAppStore((s) => s.accessToken)
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const user = useAppStore((s) => s.user)
    const clearSession = useAppStore((s) => s.clearSession)
    const navigate = useNavigate()

    const [status, setStatus] = useState<RestoreStatus>("initializing")
    const [deviceReady, setDeviceReady] = useState(false)
    const [isIn, setIsIn] = useState(false)
    const [cause, setCause] = useState<ResetCause | null>(null)
    const [words, setWords] = useState<string[]>(() =>
        Array.from({ length: RECOVERY_WORD_COUNT }, () => ""),
    )
    const [restored, setRestored] = useState(0)
    const [skipped, setSkipped] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const [lacksWords, setLacksWords] = useState(false)
    const [share, setShare] = useState<AwaitedShareState | null>(null)
    const [approvedHere, setApprovedHere] = useState(false)
    const approvedRef = useRef(false)
    const typing = useRef(false)
    const awaitedRef = useRef<AwaitedShare | null>(null)

    // Bootstrap promise — both action handlers await it before running their
    // own work so an impatient user clicking Restore mid-bootstrap doesn't
    // race with the silent register/registerDevice calls.
    const bootstrapRef = useRef<Promise<void> | null>(null)
    const inputHandleRef = useRef<RecoveryPassphraseInputHandle | null>(null)

    const ownActorUri = user?.actor_uri ?? null
    useEffect(() => {
        const accessToken = useAppStore.getState().accessToken
        if (!idpUrl || !accessToken || !ownActorUri) return
        const e2eePort = getE2eePort()
        let cancelled = false
        // The gate recorded the standing it sent the device here on: the page says why at once.
        void e2eePort.historyKeyStanding().then(
            (standing) => {
                if (!cancelled) setCause((known) => known ?? resetCause(standing))
            },
            () => undefined,
        )
        bootstrapRef.current = (async () => {
            await setUpThisDeviceUseCase({ e2eePort, sessionPort: getSessionPort() })(idpUrl, accessToken, ownActorUri)
            if (!cancelled) setDeviceReady(true)
            try {
                const { standing, admission } = await checkAdmissionUseCase(admissionDeps())(idpUrl, accessToken, ownActorUri)
                if (cancelled) return
                setIsIn(admission.kind === "in")
                setCause(resetCause(standing))
                setLacksWords(standing.kind !== "holds")
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn("Reading whether this device is in failed:", e)
            }
        })()
        bootstrapRef.current
            .then(() => {
                if (!cancelled) setStatus("ready")
            })
            .catch(async (e: unknown) => {
                if (cancelled || (await signInAgainOnDeviceMismatch(e))) return
                setStatus("error")
                setError(e instanceof Error ? e.message : "Could not set up this device.")
            })
        return () => {
            cancelled = true
        }
    }, [idpUrl, signedIn, ownActorUri])

    const listening = lacksWords && status !== "initializing" && status !== "error"
    useEffect(() => {
        if (!listening) return
        const awaited = new AwaitedShare(acceptWaitingShare, warnE2ee)
        awaitedRef.current = awaited
        let live = true
        let timer: ReturnType<typeof setTimeout> | undefined
        const unsubscribe = awaited.onChange(() => {
            const settled = awaited.state
            setShare(settled)
            // Approved here, the section goes on itself once the restore settles; typed words go on their own way.
            if (settled.kind === "kept" && !approvedRef.current && !typing.current) void navigate({ to: "/home" })
            if (settled.kind === "ended") {
                void signInAgainOnDeviceMismatch(settled.error).then((signingIn) => {
                    if (!signingIn) warnE2ee("reading the history key share", settled.error)
                })
            }
        })
        const tick = () => {
            clearTimeout(timer)
            if (!live || document.hidden) return
            void awaited.tick().then(() => {
                if (live && awaited.state.kind === "waiting") timer = setTimeout(tick, awaited.nextDelay())
            })
        }
        const onVisible = () => {
            if (!document.hidden) tick()
        }
        document.addEventListener("visibilitychange", onVisible)
        tick()
        return () => {
            live = false
            clearTimeout(timer)
            unsubscribe()
            document.removeEventListener("visibilitychange", onVisible)
            if (awaitedRef.current === awaited) awaitedRef.current = null
        }
    }, [listening, navigate])

    const onApproved = useCallback(() => {
        approvedRef.current = true
        setApprovedHere(true)
        void awaitedRef.current?.again()
    }, [])

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
        if (!idpUrl || !accessToken || !ownActorUri || !canRestore) return
        setStatus("restoring")
        setError(null)
        typing.current = true
        try {
            if (bootstrapRef.current) await bootstrapRef.current

            const result = await restoreHistoryFromPassphraseUseCase({
                ...admissionDeps(),
                sessionPort: getSessionPort(),
                historyArchivePort: getHistoryArchivePort(),
                keySharePort: getKeySharePort(),
                report: warnE2ee,
            })({ idpUrl, accessToken, actorUri: ownActorUri, passphrase: words })

            if (result.kind !== "kept") {
                setStatus("ready")
                toast.error(REFUSALS[result.kind])
                return
            }
            const restore = await restoreDueHistory()
            setStatus("done")
            if (restore.kind === "failed") {
                toast.error("Your history couldn't be brought back", { description: "It's tried again the next time Pīna'i starts." })
            } else {
                const count = restore.kind === "restored" ? restore.messages : 0
                setRestored(count)
                setSkipped(restore.kind === "restored" ? restore.skipped : 0)
                toast.success(count === 0 ? "Device set up" : `Restored ${count} message${count === 1 ? "" : "s"}`)
            }
            void navigate({ to: "/home" })
        } catch (e) {
            if (await signInAgainOnDeviceMismatch(e)) return
            setStatus("error")
            setError(e instanceof Error ? e.message : "Restore failed")
        } finally {
            typing.current = false
        }
    }, [idpUrl, accessToken, ownActorUri, canRestore, words, navigate])

    // The gate at /home lets in only a device that is.
    const onIn = useCallback(() => void navigate({ to: "/home" }), [navigate])

    const onSignOut = useCallback(() => {
        if (idpUrl) logoutUseCase(idpUrl, clearSession, getAuthPlatform())
    }, [idpUrl, clearSession])

    const welcomeName =
        user?.display_name?.trim() ||
        user?.preferred_username?.trim() ||
        user?.address?.split("@")[0] ||
        "you"

    const deviceLabel = useMemo(() => summariseUserAgent(), [])

    return {
        status,
        deviceReady,
        isIn,
        resetCause: variant === "reset" ? cause : null,
        offersWayIn: variant === "new-device" || cause === "newer-generation",
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
        onIn,
        onSignOut,
        share,
        onApproved,
        shareRefused: share?.kind === "unusable" && !approvedHere,
    }
}

const REFUSALS = {
    "wrong-passphrase": "Wrong passphrase — these aren't your account's 24 words",
    "key-swapped": "Your instance changed your history key — nothing was restored",
    "no-key": "Your account has no history passphrase yet",
    "rolled-back": "Your instance went back to an older history key — nothing was restored",
    "key-changed": "Your history key changed meanwhile — nothing was restored",
} as const

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
