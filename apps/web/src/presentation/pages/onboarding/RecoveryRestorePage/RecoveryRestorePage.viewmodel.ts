import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router"

import type { ResetCause } from "@pinai/domain/models/admission"
import type { DeviceId } from "@pinai/domain/models/e2ee"
import {
    RESTORE_TABS,
    listensForShare,
    offersStartOver as offersStartOverRule,
    offersWayIn,
    openingTab,
    shareRefused,
    shownTab,
    type RestoreTab,
    type RestoreVariant,
} from "@pinai/domain/models/restore-page"
import { logoutUseCase } from "@pinai/domain/usecases/auth/logout.usecase"
import type { AwaitedShareState } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { checkAdmissionUseCase } from "@pinai/domain/usecases/e2ee/check-admission.usecase"
import { enterRestorePageUseCase } from "@pinai/domain/usecases/e2ee/enter-restore-page.usecase"
import { gateThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/gate-this-device.usecase"
import { setUpThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/set-up-this-device.usecase"
import { instanceHost } from "@pinai/domain/models/instance"
import { getAuthPlatform, getDeviceDirectoryPort, getE2eePort, getSessionPort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { GATE_PAGES } from "@/presentation/_libs/gate-pages"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"
import { START_OVER_NOTICES, type StartOverNotice } from "@/presentation/organisms/StartOverPanel/StartOverPanel.viewmodel"
import { dropSearchParam } from "@/presentation/_libs/search-param"
import { useAwaitedShare } from "@/presentation/hooks/use-awaited-share"
import { useOwnStartOver, type OwnStartOver } from "@/presentation/hooks/use-own-start-over"
import { useTypedWords } from "@/presentation/hooks/use-typed-words"
import { useThisDeviceName } from "@/presentation/hooks/use-this-device-name"
import { useAppStore } from "@/store/store"

export type RestoreStatus = "initializing" | "ready" | "restoring" | "done" | "error"

export type { RestoreTab, RestoreVariant }

/** `?tab=start-over` opens the page on that tab: where a sign-in asked for the password comes back to. */
const TAB_PARAM = "tab"

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
    /** Another device's generation landed first or right after, or one approved this device: the gate decides where it goes. */
    onStartOverWentOtherwise: (how: StartOverNotice) => void
    onRolledBack: () => void
    /** This device's own start over request, read once for the page and its Start over panel. */
    ownStartOver: OwnStartOver
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
        const entering = enterRestorePageUseCase({
            e2eePort,
            setUp: (session) => setUpThisDeviceUseCase({ e2eePort, sessionPort: getSessionPort() })(session.idpUrl, session.accessToken, session.actorUri),
            checkAdmission: (session) => checkAdmissionUseCase(admissionDeps())(session.idpUrl, session.accessToken, session.actorUri),
            listDevices: async (session) => (await getDeviceDirectoryPort().listDevices(session.idpUrl, session.accessToken)).devices,
            signInAgainOnDeviceMismatch,
            warn: warnE2ee,
        })({ idpUrl, accessToken, actorUri: ownActorUri }, variant, {
            onEarlyCause: (cause) => setReset((known) => (known.cause ? known : { cause, replacedOn: null, refused: null })),
            onDeviceReady: () => setDeviceReady(true),
            cancelled: () => cancelled,
        })
        // A setup that failed fails the actions awaiting it too.
        const bootstrap = entering.then((entry) => {
            if (entry.kind === "failed" || entry.kind === "signing-in-again") throw entry.error
        })
        bootstrap.catch(() => undefined)
        bootstrapRef.current = bootstrap
        void entering.then((entry) => {
            if (cancelled) return
            switch (entry.kind) {
                case "go":
                    void navigate({ to: GATE_PAGES[entry.route] })
                    break
                case "new-words":
                    setNewWords(entry.words)
                    break
                case "home":
                    void navigate({ to: "/home" })
                    break
                case "ready":
                    if (entry.read) {
                        setIsIn(entry.read.isIn)
                        setLacksWords(entry.read.lacksWords)
                        setReset(entry.read.reset)
                    }
                    break
                case "failed":
                    setStatus("error")
                    setError(entry.message)
                    return
                case "signing-in-again":
                case "cancelled":
                    return
            }
            setStatus("ready")
        })
        return () => {
            cancelled = true
        }
    }, [idpUrl, signedIn, ownActorUri, attempt, navigate, variant])

    const listening = listensForShare({
        lacksWords,
        settingUp: status === "initializing",
        failed: status === "error",
        startingOver,
        showingNewWords: newWords !== null,
    })
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
        (how: StartOverNotice) => {
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

    const own = useOwnStartOver(deviceReady && !isIn && !approvedHere)
    const [tabChosen, setTabChosen] = useState(askedTab !== null)
    const ownState = own.state?.kind ?? null
    if (!tabChosen && ownState !== null) {
        setTabChosen(true)
        if (openingTab(ownState) === "start-over") {
            setTab("start-over")
            showStartOver(true)
        }
    }

    // The user acting again: the last notice no longer applies.
    const chooseTab = useCallback((next: RestoreTab) => {
        setTabChosen(true)
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

    const deviceLabel = useThisDeviceName()
    const offersStartOver = offersStartOverRule(isIn)

    return {
        status: typed.restoring ? "restoring" : status,
        deviceReady,
        isIn,
        resetCause: variant === "reset" ? reset.cause : null,
        replacedOn: variant === "reset" ? reset.replacedOn : null,
        refused: variant === "reset" ? reset.refused : null,
        offersWayIn: offersWayIn(variant, reset.cause),
        instance: instanceHost(idpUrl),
        offersStartOver,
        deviceLabel,
        tab: shownTab(tab, isIn),
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
        shareRefused: shareRefused(share, approvedHere),
        startOverReturn,
        onStartOverBusy,
        newWords,
        onStartedOver,
        onStartOverWentOtherwise,
        onRolledBack,
        ownStartOver: own,
    }
}

function askedIn(searchStr: string): RestoreTab | null {
    const asked = new URLSearchParams(searchStr).get(TAB_PARAM)
    return RESTORE_TABS.find((tab) => tab === asked) ?? null
}
