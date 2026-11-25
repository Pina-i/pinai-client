import { instanceAddress } from "@pinai/domain/models/instance"
import { listensForShare, type RestoreTab } from "@pinai/domain/models/restore-page"
import { checkAdmissionUseCase } from "@pinai/domain/usecases/e2ee/check-admission.usecase"
import { enterRestorePageUseCase } from "@pinai/domain/usecases/e2ee/enter-restore-page.usecase"
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
import { useAppStore } from "@/store/store"

export type NewDeviceView = { kind: "loading" } | { kind: "ready" } | { kind: "failed"; message: string }

/** Start over is 26g's: the phone offers the code and the words for now. */
export const WAYS: readonly { id: RestoreTab; label: string }[] = [
    { id: "device", label: "Device" },
    { id: "words", label: "24 words" },
]

/**
 * A device that never held the account's words: set up as it opens (registered, named, no KeyPackage), sent on where the
 * gate says, then waiting for its key share — kept, on to the app. The code and the typed words are its ways in.
 */
export function useNewDeviceViewModel() {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const [view, setView] = useState<NewDeviceView>({ kind: "loading" })
    const [deviceReady, setDeviceReady] = useState(false)
    const [lacksWords, setLacksWords] = useState(false)
    // `?tab=` — where a sign-in asked for the password comes back to — opens that way, then leaves the address.
    const { tab: askedTab } = useLocalSearchParams<{ tab?: string }>()
    const [tab, setTab] = useState<RestoreTab>(() => WAYS.find((way) => way.id === askedTab)?.id ?? "device")
    useEffect(() => {
        if (askedTab) router.setParams({ tab: undefined })
    }, [askedTab])
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
            setUp: (session) => setUpThisDeviceUseCase({ e2eePort, sessionPort: getSessionPort() })(session.idpUrl, session.accessToken, session.actorUri),
            checkAdmission: (session) => checkAdmissionUseCase(admissionDeps())(session.idpUrl, session.accessToken, session.actorUri),
            listDevices: async (session) => (await getDeviceDirectoryPort().listDevices(session.idpUrl, session.accessToken)).devices,
            signInAgainOnDeviceMismatch,
            warn: warnE2ee,
        })({ idpUrl, accessToken, actorUri }, "new-device", {
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
    }, [signedIn, idpUrl, actorUri, attempt])

    const listening = listensForShare({
        lacksWords,
        settingUp: view.kind === "loading",
        failed: view.kind === "failed",
        startingOver: false,
        showingNewWords: false,
    })
    const awaited = useAwaitedShare(listening, () => {
        if (!approved.current && !typing.current) router.replace("/home")
    })
    const { again } = awaited

    const onApproved = useCallback(() => {
        approved.current = true
        again()
    }, [again])
    const setUp = useCallback(() => setUpRef.current, [])
    const onTyping = useCallback((busy: boolean) => {
        typing.current = busy
    }, [])
    const onIn = useCallback(() => router.replace("/home"), [])

    return {
        view,
        host: (idpUrl && instanceAddress(idpUrl)?.host) ?? "",
        tab,
        setTab,
        deviceReady,
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
