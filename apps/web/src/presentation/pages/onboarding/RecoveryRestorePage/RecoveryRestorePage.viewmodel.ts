import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router"
import { toast } from "sonner"

import { replacedOn, resetCause, type ResetCause } from "@pinai/domain/models/admission"
import { logoutUseCase } from "@pinai/domain/usecases/auth/logout.usecase"
import { AwaitedShare, type AwaitedShareState } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { checkAdmissionUseCase } from "@pinai/domain/usecases/e2ee/check-admission.usecase"
import { gateThisDeviceUseCase, pendingKeyRoute } from "@pinai/domain/usecases/e2ee/gate-this-device.usecase"
import { restoreHistoryFromPassphraseUseCase } from "@pinai/domain/usecases/e2ee/restore-history-from-passphrase.usecase"
import { setUpThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/set-up-this-device.usecase"
import { getAuthPlatform, getDeviceDirectoryPort, getE2eePort, getHistoryArchivePort, getKeySharePort, getSessionPort } from "@/ioc"
import { acceptWaitingShare } from "@/presentation/_libs/accept-share"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { GATE_PAGES } from "@/presentation/_libs/gate-pages"
import { restoreDueHistory } from "@/presentation/_libs/history-restore"
import { instanceHost } from "@/presentation/_libs/instance-host"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"
import { dropSearchParam } from "@/presentation/_libs/search-param"
import {
    RECOVERY_WORD_COUNT,
    isPassphraseComplete,
} from "@/presentation/molecules/RecoveryPassphraseInput/RecoveryPassphraseInput.helper"
import { useAppStore } from "@/store/store"

export type RestoreStatus = "initializing" | "ready" | "restoring" | "done" | "error"

/** § 5.2's page for a device that never held the account's passphrase; § 5.4's for one whose words no longer give it. */
export type RestoreVariant = "new-device" | "reset"

/** "Another device" / "That device", "My 24 words" / "Its 24 words", "Start over" / "Start over from here". */
export type RestoreTab = "device" | "words" | "start-over"

/** `?tab=start-over` opens the page on that tab: where a sign-in asked for the password comes back to. */
const TAB_PARAM = "tab"
const TABS: readonly RestoreTab[] = ["device", "words", "start-over"]

export interface RecoveryRestoreViewModel {
    status: RestoreStatus
    /** Registered and named on its session: it can ask another device to approve it, or start over. */
    deviceReady: boolean
    /** Let in already — arrived from Settings → Devices: it may go back. Never a way in. */
    isIn: boolean
    /** What the reset page says happened; `null` until known. */
    resetCause: ResetCause | null
    /** On the reset page: the device this one found approved that replaced the words, by its label; `null` for any other. */
    replacedOn: string | null
    /**
     * Another device's code and the 24 words can let this device in: never on a reset no start over
     * explains — no device holds the key the instance put in, and the old words are refused.
     */
    offersWayIn: boolean
    /** The instance this device signs in to, by its host. */
    instance: string
    /** Start over is offered: never to a device already in, which only came to bring its history. */
    offersStartOver: boolean
    /** "Chrome on macOS" / "Web client" — this device until the instance's list names it. */
    deviceLabel: string
    tab: RestoreTab
    setTab: (tab: RestoreTab) => void
    /** A start over or typed words run: the tabs hold still. */
    busy: boolean
    /** On the reset page after an unknown change: the start over's warning shown in place of the explanation. */
    startOverShown: boolean
    showStartOver: (shown: boolean) => void
    words: string[]
    setWords: (next: string[]) => void
    /** True when every slot holds a valid BIP-39 word. */
    canRestore: boolean
    error: string | null
    /** A line over the card: what went otherwise than asked, until the user acts again. */
    notice: string | null
    /** The instance went back on the account's key: the reset page says only it can put it back. */
    rolledBack: boolean
    /** Approved by another device's code here: starting over is no longer this device's to do. */
    approvedHere: boolean
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
    /** Where a sign-in asked for before a start over comes back to. */
    startOverReturn: () => string
    onStartOverBusy: (busy: boolean) => void
    /** The account's new words, once this device started over — or a reload since, nobody gone past them. */
    newWords: string[] | null
    onStartedOver: (words: string[]) => void
    /** Another device's generation landed first, or right after: the gate decides where this one goes. */
    onStartOverWentOtherwise: (how: "conflict" | "key-changed") => void
    onRolledBack: () => void
}

const NOTICES = {
    conflict: "Another of your devices set a new passphrase at the same moment, so this one didn't start over.",
    "key-changed": "This device started over, then another of your devices set a newer passphrase: its words are the ones now.",
} as const

/**
 * The pages a device that isn't in stays on, drawn as Pass: no way in but another device's approval,
 * the 24 words, or a start over — or signing out. The device is set up on mount — registered and
 * named on its session, no KeyPackage published —, a pending key sending it to the setup page that
 * settles it, then whether it is in read; lacking the words, it reads its key share on the entry's
 * backoff, and kept goes on to the app, the archive coming back behind it. Typed words are checked
 * against the account's history key before anything is kept. A start over shows its new words here.
 */
export function useRecoveryRestorePageViewModel(variant: RestoreVariant = "new-device"): RecoveryRestoreViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const accessToken = useAppStore((s) => s.accessToken)
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const user = useAppStore((s) => s.user)
    const clearSession = useAppStore((s) => s.clearSession)
    const navigate = useNavigate()
    const router = useRouter()
    const pathname = useLocation({ select: (l) => l.pathname })
    // Read as the page mounts, which a sign-in coming back to it always does.
    const askedTab = useLocation({ select: (l) => askedIn(l.searchStr) })

    const [status, setStatus] = useState<RestoreStatus>("initializing")
    const [deviceReady, setDeviceReady] = useState(false)
    const [isIn, setIsIn] = useState(false)
    // Set together: a newer generation's title waits for its setter, so it never changes under the user's eyes.
    const [reset, setReset] = useState<{ cause: ResetCause | null; replacedOn: string | null }>({ cause: null, replacedOn: null })
    const [tab, setTab] = useState<RestoreTab>(askedTab ?? "device")
    const [startOverShown, showStartOver] = useState(askedTab === "start-over")
    const [startingOver, setStartingOver] = useState(false)
    const [newWords, setNewWords] = useState<string[] | null>(null)
    const [words, setWords] = useState<string[]>(() => Array.from({ length: RECOVERY_WORD_COUNT }, () => ""))
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [rolledBack, setRolledBack] = useState(false)
    const [lacksWords, setLacksWords] = useState(false)
    const [share, setShare] = useState<AwaitedShareState | null>(null)
    const [approvedHere, setApprovedHere] = useState(false)
    const [attempt, setAttempt] = useState(0)
    const approvedRef = useRef(false)
    const typing = useRef(false)
    const awaitedRef = useRef<AwaitedShare | null>(null)

    // Both actions await it, so a press mid-setup doesn't race the silent registration.
    const bootstrapRef = useRef<Promise<void> | null>(null)

    useEffect(() => {
        if (askedTab) dropSearchParam(router, TAB_PARAM)
    }, [askedTab, router])

    const ownActorUri = user?.actor_uri ?? null
    useEffect(() => {
        const accessToken = useAppStore.getState().accessToken
        if (!idpUrl || !accessToken || !ownActorUri) return
        const e2eePort = getE2eePort()
        let cancelled = false
        // The gate recorded the standing it sent the device here on: an unknown change is said at once.
        void e2eePort.historyKeyStanding().then(
            (standing) => {
                if (cancelled || resetCause(standing) !== "unknown-change") return
                setReset((known) => (known.cause ? known : { cause: "unknown-change", replacedOn: null }))
            },
            () => undefined,
        )
        bootstrapRef.current = (async () => {
            // A start over cut short by a reload: the setup page settles its key, and shows its words once set.
            const pending = await pendingKeyRoute(e2eePort)
            if (pending) {
                if (!cancelled) void navigate({ to: GATE_PAGES[pending] })
                return
            }
            const unseen = await e2eePort.newWordsToShow()
            if (unseen) {
                if (!cancelled) setNewWords(unseen.words)
                return
            }
            await setUpThisDeviceUseCase({ e2eePort, sessionPort: getSessionPort() })(idpUrl, accessToken, ownActorUri)
            if (!cancelled) setDeviceReady(true)
            try {
                const { standing, admission } = await checkAdmissionUseCase(admissionDeps())(idpUrl, accessToken, ownActorUri)
                if (cancelled) return
                // The reset page is for a device that is out: one let in meanwhile goes back to the app.
                if (variant === "reset" && admission.kind === "in") {
                    void navigate({ to: "/home" })
                    return
                }
                setIsIn(admission.kind === "in")
                setLacksWords(standing.kind !== "holds")
                const cause = resetCause(standing)
                let setterLabel: string | null = null
                if (variant === "reset" && cause === "newer-generation") {
                    try {
                        const { devices } = await getDeviceDirectoryPort().listDevices(idpUrl, accessToken)
                        setterLabel = replacedOn(standing, await e2eePort.resetSetter(devices), devices)
                    } catch (e) {
                        warnE2ee("reading who replaced the words", e)
                    }
                }
                if (!cancelled) setReset({ cause, replacedOn: setterLabel })
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
    }, [idpUrl, signedIn, ownActorUri, attempt, navigate, variant])

    // A start over takes the words itself: a share kept meanwhile must not carry the page off before they are shown.
    const listening = lacksWords && status !== "initializing" && status !== "error" && !startingOver && newWords === null
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

    const onRestore = useCallback(async () => {
        if (!idpUrl || !accessToken || !ownActorUri || !canRestore) return
        setStatus("restoring")
        setError(null)
        setNotice(null)
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

    const startOverReturn = useCallback(() => `${pathname}?${TAB_PARAM}=start-over`, [pathname])

    const onStartedOver = useCallback((next: string[]) => setNewWords(next), [])

    const onStartOverWentOtherwise = useCallback(
        (how: "conflict" | "key-changed") => {
            const accessToken = useAppStore.getState().accessToken
            if (!idpUrl || !accessToken || !ownActorUri) return
            setNotice(NOTICES[how])
            void gateThisDeviceUseCase(admissionDeps())(idpUrl, accessToken, ownActorUri).then(
                (route) => {
                    const to = GATE_PAGES[route]
                    if (to !== pathname) {
                        void navigate({ to })
                        return
                    }
                    // The same page, seen anew: what changed is read again.
                    setTab("device")
                    showStartOver(false)
                    setAttempt((n) => n + 1)
                },
                (e: unknown) => warnE2ee("deciding where this device goes", e),
            )
        },
        [idpUrl, ownActorUri, pathname, navigate],
    )

    const onRolledBack = useCallback(() => setRolledBack(true), [])

    // The user acting again: the last notice no longer applies.
    const chooseTab = useCallback((next: RestoreTab) => {
        setNotice(null)
        setTab(next)
    }, [])
    const toggleStartOver = useCallback((shown: boolean) => {
        setNotice(null)
        showStartOver(shown)
    }, [])
    const onStartOverBusy = useCallback((busy: boolean) => {
        if (busy) setNotice(null)
        setStartingOver(busy)
    }, [])

    const deviceLabel = useMemo(() => summariseUserAgent(), [])
    const offersStartOver = !isIn
    // A device found in has no Start over tab: it opens on another way in.
    const shownTab = !offersStartOver && tab === "start-over" ? "device" : tab

    return {
        status,
        deviceReady,
        isIn,
        resetCause: variant === "reset" ? reset.cause : null,
        replacedOn: variant === "reset" ? reset.replacedOn : null,
        offersWayIn: variant === "new-device" || reset.cause === "newer-generation",
        instance: instanceHost(idpUrl),
        offersStartOver,
        deviceLabel,
        tab: shownTab,
        setTab: chooseTab,
        busy: startingOver || status === "restoring",
        startOverShown,
        showStartOver: toggleStartOver,
        words,
        setWords,
        canRestore,
        error,
        notice,
        rolledBack,
        approvedHere,
        onRestore,
        onIn,
        onSignOut,
        share,
        onApproved,
        shareRefused: share?.kind === "unusable" && !approvedHere,
        startOverReturn,
        onStartOverBusy,
        newWords,
        onStartedOver,
        onStartOverWentOtherwise,
        onRolledBack,
    }
}

function askedIn(searchStr: string): RestoreTab | null {
    const asked = new URLSearchParams(searchStr).get(TAB_PARAM)
    return TABS.find((tab) => tab === asked) ?? null
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
