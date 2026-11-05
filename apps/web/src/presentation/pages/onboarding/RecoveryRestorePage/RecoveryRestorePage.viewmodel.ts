import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router"

import { replacedOn, resetCause, type ResetCause } from "@pinai/domain/models/admission"
import type { DeviceId } from "@pinai/domain/models/e2ee"
import { logoutUseCase } from "@pinai/domain/usecases/auth/logout.usecase"
import type { AwaitedShareState } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { checkAdmissionUseCase } from "@pinai/domain/usecases/e2ee/check-admission.usecase"
import { gateThisDeviceUseCase, pendingKeyRoute } from "@pinai/domain/usecases/e2ee/gate-this-device.usecase"
import { setUpThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/set-up-this-device.usecase"
import { getAuthPlatform, getDeviceDirectoryPort, getE2eePort, getSessionPort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { userAgentLabel } from "@/presentation/_libs/user-agent-label"
import { GATE_PAGES } from "@/presentation/_libs/gate-pages"
import { instanceHost } from "@/presentation/_libs/instance-host"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"
import { START_OVER_NOTICES } from "@/presentation/organisms/StartOverPanel/StartOverPanel.viewmodel"
import { dropSearchParam } from "@/presentation/_libs/search-param"
import { useAwaitedShare } from "@/presentation/hooks/use-awaited-share"
import { useTypedWords } from "@/presentation/hooks/use-typed-words"
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
    /** "It wasn't me" on the reset page: the device the key names, kept apart from the devices from before. */
    refused: DeviceId | null
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
    const [reset, setReset] = useState<{ cause: ResetCause | null; replacedOn: string | null; refused: DeviceId | null }>({
        cause: null,
        replacedOn: null,
        refused: null,
    })
    const [tab, setTab] = useState<RestoreTab>(askedTab ?? "device")
    const [startOverShown, showStartOver] = useState(askedTab === "start-over")
    const [startingOver, setStartingOver] = useState(false)
    const [newWords, setNewWords] = useState<string[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [rolledBack, setRolledBack] = useState(false)
    const [lacksWords, setLacksWords] = useState(false)
    const [approvedHere, setApprovedHere] = useState(false)
    const [attempt, setAttempt] = useState(0)
    const approvedRef = useRef(false)
    const typing = useRef(false)

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
                setReset((known) => (known.cause ? known : { cause: "unknown-change", replacedOn: null, refused: null }))
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
                let refused: DeviceId | null = null
                if (variant === "reset" && cause === "newer-generation") {
                    try {
                        const { devices } = await getDeviceDirectoryPort().listDevices(idpUrl, accessToken)
                        const setter = await e2eePort.resetSetter(devices)
                        setterLabel = replacedOn(standing, setter, devices)
                        refused = setter && !setter.self ? setter.deviceId : null
                    } catch (e) {
                        warnE2ee("reading who replaced the words", e)
                    }
                }
                if (!cancelled) setReset({ cause, replacedOn: setterLabel, refused })
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
    // Approved here, the section goes on itself once the restore settles; typed words go on their own way.
    const awaited = useAwaitedShare(listening, () => {
        if (!approvedRef.current && !typing.current) void navigate({ to: "/home" })
    })
    const share = awaited.share
    const { again } = awaited

    const onApproved = useCallback(() => {
        approvedRef.current = true
        setApprovedHere(true)
        again()
    }, [again])

    const setUp = useCallback(() => bootstrapRef.current, [])
    const onTyping = useCallback((busy: boolean) => {
        typing.current = busy
        if (!busy) return
        setError(null)
        setNotice(null)
    }, [])
    const onWordsKept = useCallback(() => {
        setStatus("done")
        void navigate({ to: "/home" })
    }, [navigate])
    const onWordsFailed = useCallback((message: string) => {
        setStatus("error")
        setError(message)
    }, [])
    const typed = useTypedWords({ ready: setUp, onBusy: onTyping, onKept: onWordsKept, onFailed: onWordsFailed })

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
            setNotice(START_OVER_NOTICES[how])
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

    const deviceLabel = useMemo(() => userAgentLabel(), [])
    const offersStartOver = !isIn
    // A device found in has no Start over tab: it opens on another way in.
    const shownTab = !offersStartOver && tab === "start-over" ? "device" : tab

    return {
        status: typed.restoring ? "restoring" : status,
        deviceReady,
        isIn,
        resetCause: variant === "reset" ? reset.cause : null,
        replacedOn: variant === "reset" ? reset.replacedOn : null,
        refused: variant === "reset" ? reset.refused : null,
        offersWayIn: variant === "new-device" || reset.cause === "newer-generation",
        instance: instanceHost(idpUrl),
        offersStartOver,
        deviceLabel,
        tab: shownTab,
        setTab: chooseTab,
        busy: startingOver || typed.restoring,
        startOverShown,
        showStartOver: toggleStartOver,
        words: typed.words,
        setWords: typed.setWords,
        canRestore: typed.canRestore,
        error,
        notice,
        rolledBack,
        approvedHere,
        onRestore: typed.onRestore,
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
