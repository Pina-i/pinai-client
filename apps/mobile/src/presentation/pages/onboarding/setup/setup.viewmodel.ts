import { bootstrapFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/bootstrap-first-device.usecase"
import { gateThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/gate-this-device.usecase"
import { setUpFirstDeviceUseCase } from "@pinai/domain/usecases/e2ee/set-up-first-device.usecase"
import { router } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { getDeviceDirectoryPort, getE2eePort, getHistoryArchivePort, getPendingKeyLock, getSessionPort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { signOut } from "@/presentation/_libs/session"
import { enterAccount } from "@/presentation/_libs/this-device"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { GATE_ROUTES } from "@/presentation/hooks/use-onboarding-gate"
import { useAppStore } from "@/store/store"

export type SetupView =
    { kind: "loading"; stage: "checking" | "running" } | { kind: "words"; words: string[]; fresh: boolean } | { kind: "failed"; message: string }

/**
 * The first device's screen: the domain's `setUpFirstDeviceUseCase` run, its words shown — or a start over's new
 * words, forgotten on Continue —, a pending key tried again after its delay, another device's key sent where the
 * gate says.
 */
export function useSetupViewModel() {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const [view, setView] = useState<SetupView>({ kind: "loading", stage: "running" })
    const [saved, setSaved] = useState(false)
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        const accessToken = useAppStore.getState().accessToken
        if (!signedIn || !idpUrl || !actorUri || !accessToken) return
        // The layout opens the account too, but a child's effect runs before its parent's.
        enterAccount(actorUri)
        let cancelled = false
        let again: ReturnType<typeof setTimeout> | undefined
        void setUpFirstDeviceUseCase({
            e2eePort: getE2eePort(),
            bootstrap: (session) =>
                bootstrapFirstDeviceUseCase({
                    e2eePort: getE2eePort(),
                    sessionPort: getSessionPort(),
                    historyArchivePort: getHistoryArchivePort(),
                    deviceDirectoryPort: getDeviceDirectoryPort(),
                    pendingKeyLock: getPendingKeyLock(),
                    report: warnE2ee,
                })(session),
            gateRoute: (session) => gateThisDeviceUseCase(admissionDeps())(session.idpUrl, session.accessToken, session.actorUri),
            signInAgainOnDeviceMismatch,
        })(
            { idpUrl, accessToken, actorUri },
            (stage) => {
                if (!cancelled) setView({ kind: "loading", stage })
            },
            () => cancelled
        ).then((outcome) => {
            if (cancelled) return
            switch (outcome.kind) {
                case "words":
                    setView({ kind: "words", words: outcome.words, fresh: false })
                    return
                case "new-words":
                    setView({ kind: "words", words: outcome.words, fresh: true })
                    return
                case "retry":
                    again = setTimeout(() => setAttempt((n) => n + 1), outcome.afterMs)
                    return
                case "go":
                    router.replace(outcome.route === "app" ? "/home" : GATE_ROUTES[outcome.route])
                    return
                case "failed":
                    setView({ kind: "failed", message: outcome.message })
                    return
            }
        })
        return () => {
            cancelled = true
            clearTimeout(again)
        }
    }, [signedIn, idpUrl, actorUri, attempt])

    const onStart = useCallback(() => {
        if (view.kind !== "words") return
        // The gate at /home lets in only a device that is.
        if (!view.fresh) return router.replace("/home")
        void getE2eePort()
            .dismissNewWords()
            .catch((error: unknown) => warnE2ee("forgetting the new words were to be shown", error))
            .finally(() => router.replace("/home"))
    }, [view])

    const onRetry = useCallback(() => {
        setView({ kind: "loading", stage: "running" })
        setAttempt((n) => n + 1)
    }, [])

    return { view, saved, setSaved, onStart, onRetry, onSignOut: signOut }
}
