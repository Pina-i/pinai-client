import { instanceAddress } from "@pinai/domain/models/instance"
import type { ResetCause } from "@pinai/domain/models/admission"
import type { DeviceId } from "@pinai/domain/models/e2ee"
import { listensForShare, offersWayIn, openingTab, type RestoreTab, type RestoreVariant } from "@pinai/domain/models/restore-page"
import { checkAdmissionUseCase } from "@pinai/domain/usecases/e2ee/check-admission.usecase"
import { enterRestorePageUseCase } from "@pinai/domain/usecases/e2ee/enter-restore-page.usecase"
import { gateThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/gate-this-device.usecase"
import { setUpThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/set-up-this-device.usecase"
import { router, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { getDeviceDirectoryPort, getE2eePort, getSessionPort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { signOut } from "@/presentation/_libs/session"
import { enterAccount } from "@/presentation/_libs/this-device"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useAwaitedShare } from "@/presentation/hooks/use-awaited-share"
import { GATE_ROUTES } from "@/presentation/hooks/use-onboarding-gate"
import { useOwnStartOver } from "@/presentation/hooks/use-own-start-over"
import { useAppStore } from "@/store/store"
import { START_OVER_NOTICES, type StartOverNotice } from "./start-over-way/start-over-wording"

export type NewDeviceView = { kind: "loading" } | { kind: "ready" } | { kind: "failed"; message: string }

export const WAYS: readonly { id: RestoreTab; label: string }[] = [
    { id: "device", label: "Device" },
    { id: "words", label: "24 words" },
    { id: "start-over", label: "Start over" },
]

// On the reset page the ways are the device that reset the history and its words.
const RESET_WAYS: readonly { id: RestoreTab; label: string }[] = [
    { id: "device", label: "That device" },
    { id: "words", label: "Its 24 words" },
    { id: "start-over", label: "Start over" },
]

const RESET_TITLES: Record<ResetCause | "unknown", string> = {
    "newer-generation": "Your history was reset from another device",
    "unknown-change": "Your instance changed your history key",
    "unknown": "Your history key changed",
}

interface ResetReading {
    cause: ResetCause | null
    /** The setter's name, when this device found it approved. */
    replacedOn: string | null
    /** "It wasn't me": the device the key names. */
    refused: DeviceId | null
}

/**
 * A device that never held the account's words (`new-device`), or whose words no longer give the account's key (`reset`):
 * set up as it opens (registered, named, no KeyPackage), sent on where the gate says, then waiting for its key share —
 * kept, on to the app. The code, the typed words and starting over are its ways in.
 */
export function useNewDeviceViewModel(variant: RestoreVariant) {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const [view, setView] = useState<NewDeviceView>({ kind: "loading" })
    const [deviceReady, setDeviceReady] = useState(false)
    const [lacksWords, setLacksWords] = useState(false)
    // `?tab=` — where a sign-in asked for the password comes back to — opens that way, then leaves the address.
    const { tab: askedTab } = useLocalSearchParams<{ tab?: string }>()
    const [tab, setTab] = useState<RestoreTab>(() => WAYS.find((way) => way.id === askedTab)?.id ?? "device")
    const [tabChosen, setTabChosen] = useState(askedTab !== undefined)
    // Set together: the title never changes under the user's eyes.
    const [reset, setReset] = useState<ResetReading>({ cause: null, replacedOn: null, refused: null })
    // After an unknown change, Start over is shown in place of what happened.
    const [startOverShown, showStartOver] = useState(askedTab === "start-over")
    useEffect(() => {
        if (askedTab) router.setParams({ tab: undefined })
    }, [askedTab])
    const [startingOver, setStartingOver] = useState(false)
    const [approvedHere, setApprovedHere] = useState(false)
    const [notice, setNotice] = useState<string | null>(null)
    const [rolledBack, setRolledBack] = useState(false)
    const [attempt, setAttempt] = useState(0)
    // Both ways await it, so a press mid-setup doesn't race the registration.
    const setUpRef = useRef<Promise<void> | null>(null)
    // Approved here, or words being checked: those ways go on themselves.
    const approved = useRef(false)
    const typing = useRef(false)

    useEffect(() => {
        const accessToken = useAppStore.getState().accessToken
        if (!signedIn || !idpUrl || !actorUri || !accessToken) return
        enterAccount(actorUri)
        const e2eePort = getE2eePort()
        let cancelled = false
        const entering = enterRestorePageUseCase({
            e2eePort,
            setUp: (session) =>
                setUpThisDeviceUseCase({ e2eePort, sessionPort: getSessionPort() })(session.idpUrl, session.accessToken, session.actorUri),
            checkAdmission: (session) => checkAdmissionUseCase(admissionDeps())(session.idpUrl, session.accessToken, session.actorUri),
            listDevices: async (session) => (await getDeviceDirectoryPort().listDevices(session.idpUrl, session.accessToken)).devices,
            signInAgainOnDeviceMismatch,
            warn: warnE2ee,
        })({ idpUrl, accessToken, actorUri }, variant, {
            onEarlyCause: (cause) => setReset((known) => (known.cause ? known : { cause, replacedOn: null, refused: null })),
            onDeviceReady: () => setDeviceReady(true),
            cancelled: () => cancelled,
        })
        const setUp = entering.then((entry) => {
            if (entry.kind === "failed" || entry.kind === "signing-in-again") throw entry.error
        })
        setUp.catch(() => undefined)
        setUpRef.current = setUp
        void entering.then((entry) => {
            if (cancelled) return
            switch (entry.kind) {
                case "go":
                    router.replace(entry.route === "app" ? "/home" : GATE_ROUTES[entry.route])
                    return
                case "home":
                    router.replace("/home")
                    return
                case "new-words":
                    // The setup page shows a start over's new words.
                    router.replace(GATE_ROUTES.setup)
                    return
                case "ready":
                    if (entry.read?.isIn) {
                        router.replace("/home")
                        return
                    }
                    setLacksWords(entry.read?.lacksWords ?? false)
                    if (entry.read) setReset(entry.read.reset)
                    setView({ kind: "ready" })
                    return
                case "failed":
                    setView({ kind: "failed", message: entry.message })
                    return
                case "signing-in-again":
                case "cancelled":
                    return
            }
        })
        return () => {
            cancelled = true
        }
    }, [signedIn, idpUrl, actorUri, attempt, variant])

    const listening = listensForShare({
        lacksWords,
        settingUp: view.kind === "loading",
        failed: view.kind === "failed",
        startingOver,
        showingNewWords: false,
    })
    const awaited = useAwaitedShare(listening, () => {
        if (!approved.current && !typing.current) router.replace("/home")
    })
    const { again } = awaited

    const onApproved = useCallback(() => {
        approved.current = true
        setApprovedHere(true)
        again()
    }, [again])

    // This device's own request, read once for the page and its Start over way: one waiting or ended opens there.
    const own = useOwnStartOver(deviceReady && !approvedHere)
    const ownState = own.state?.kind ?? null
    if (!tabChosen && ownState !== null) {
        setTabChosen(true)
        if (openingTab(ownState) === "start-over") setTab("start-over")
    }
    const chooseTab = useCallback((next: RestoreTab) => {
        setTabChosen(true)
        setNotice(null)
        setTab(next)
    }, [])

    // Another device's generation landed, or one approved this device: the gate decides where it goes.
    const onWentOtherwise = useCallback(
        (how: StartOverNotice) => {
            const accessToken = useAppStore.getState().accessToken
            if (!idpUrl || !accessToken || !actorUri) return
            setNotice(START_OVER_NOTICES[how])
            void gateThisDeviceUseCase(admissionDeps())(idpUrl, accessToken, actorUri).then(
                (route) => {
                    if (route !== variant) {
                        router.replace(route === "app" ? "/home" : GATE_ROUTES[route])
                        return
                    }
                    setTab("device")
                    showStartOver(false)
                    setAttempt((n) => n + 1)
                },
                (error: unknown) => warnE2ee("deciding where this device goes", error)
            )
        },
        [idpUrl, actorUri, variant]
    )
    const setUp = useCallback(() => setUpRef.current, [])
    const onTyping = useCallback((busy: boolean) => {
        typing.current = busy
    }, [])
    const onIn = useCallback(() => router.replace("/home"), [])

    const isReset = variant === "reset"
    return {
        view,
        variant,
        ways: isReset ? RESET_WAYS : WAYS,
        title: !isReset
            ? "New device"
            : reset.replacedOn
              ? `Your words were replaced on ${reset.replacedOn}`
              : RESET_TITLES[reset.cause ?? "unknown"],
        offersWayIn: offersWayIn(variant, reset.cause),
        resetCause: isReset ? reset.cause : null,
        replacedOn: isReset ? reset.replacedOn : null,
        refused: isReset ? reset.refused : null,
        startOverShown,
        showStartOver: useCallback((shown: boolean) => {
            setNotice(null)
            showStartOver(shown)
        }, []),
        host: (idpUrl && instanceAddress(idpUrl)?.host) ?? "",
        tab,
        setTab: chooseTab,
        busy: startingOver,
        notice,
        deviceReady,
        own,
        startOverReady: deviceReady && !approvedHere,
        returnTo: useCallback(() => `${GATE_ROUTES[variant]}?tab=start-over`, [variant]),
        onStartOverBusy: useCallback((busy: boolean) => {
            if (busy) setNotice(null)
            setStartingOver(busy)
        }, []),
        // The setup page shows a start over's new words.
        onStartedOver: useCallback(() => router.replace(GATE_ROUTES.setup), []),
        onWentOtherwise,
        rolledBack,
        onRolledBack: useCallback(() => setRolledBack(true), []),
        share: awaited.share,
        onApproved,
        setUp,
        onTyping,
        onIn,
        onRetry: () => {
            setView({ kind: "loading" })
            setAttempt((n) => n + 1)
        },
        onSignOut: signOut,
    }
}
