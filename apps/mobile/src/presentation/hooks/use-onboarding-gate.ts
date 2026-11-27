import type { GateRoute, KeptWordsReset } from "@pinai/domain/models/admission"
import { gateDecisionUseCase } from "@pinai/domain/usecases/e2ee/gate-this-device.usecase"
import { OnboardingGate, type GateVerdict, type RecheckOutcome } from "@pinai/domain/usecases/e2ee/onboarding-gate.usecase"
import { router, usePathname } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { AppState } from "react-native"
import { getE2eePort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { enterAccount } from "@/presentation/_libs/this-device"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useAppStore } from "@/store/store"

/** Where the gate sends a device that isn't in. */
export const GATE_ROUTES: Record<Exclude<GateRoute, "app">, string> = {
    "setup": "/onboarding/setup",
    "new-device": "/onboarding/new-device",
    "reset": "/onboarding/reset",
}

export type GateStatus = "checking" | "in" | "elsewhere" | "failed"

/**
 * The domain's `OnboardingGate` on the phone: the account's core opened and the device started, then where the
 * device belongs. Once in, checked again at a route change and when the app comes back to the front; in by its kept
 * words over a reset it didn't make, why (`reset`), which the history-reset banner says.
 */
export function useOnboardingGate(): { status: GateStatus; retry: () => void; reset: KeptWordsReset | null; recheck: () => Promise<RecheckOutcome> } {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const pathname = usePathname()
    const [attempt, setAttempt] = useState(0)
    const key = signedIn && idpUrl && actorUri ? `${idpUrl}|${actorUri}|${attempt}` : null
    const [probed, setProbed] = useState<{ key: string; status: GateStatus; reset: KeptWordsReset | null } | null>(null)
    const status: GateStatus = key !== null && probed?.key === key ? probed.status : "checking"
    const watching = useRef<OnboardingGate | null>(null)

    useEffect(() => {
        if (key === null || !idpUrl || !actorUri || !useAppStore.getState().accessToken) return
        enterAccount(actorUri)
        const gate = new OnboardingGate({
            e2eePort: getE2eePort(),
            decide: gateDecisionUseCase(admissionDeps()),
            session: () => {
                const accessToken = useAppStore.getState().accessToken
                return accessToken ? { idpUrl, accessToken, actorUri } : null
            },
            warn: (what, error) => warnE2ee(`onboarding gate: ${what}`, error ?? ""),
        })
        const show = (verdict: GateVerdict) => {
            if (verdict.kind === "in") {
                setProbed({ key, status: "in", reset: verdict.reset })
            } else if (verdict.kind === "go") {
                gate.close()
                if (watching.current === gate) watching.current = null
                setProbed({ key, status: "elsewhere", reset: null })
                router.replace(GATE_ROUTES[verdict.route])
            }
        }
        let cancelled = false
        void gate.probe().then((verdict) => {
            if (cancelled) return
            // Another account's device wiped, its conversations' rows with it: nothing read them yet, so it checks again.
            if (verdict.kind === "wiped") return setAttempt((n) => n + 1)
            if (verdict.kind === "failed") return setProbed({ key, status: "failed", reset: null })
            show(verdict)
            if (verdict.kind === "in") {
                gate.watch(show)
                watching.current = gate
            }
        })
        return () => {
            cancelled = true
            gate.close()
            if (watching.current === gate) watching.current = null
        }
    }, [key, idpUrl, actorUri])

    useEffect(() => {
        if (actorUri && useAppStore.getState().accessToken) enterAccount(actorUri)
        void watching.current?.recheck(false)
    }, [pathname, actorUri])

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (state) => {
            if (state === "active") void watching.current?.recheck(false)
        })
        return () => subscription.remove()
    }, [])

    const retry = useCallback(() => setAttempt((n) => n + 1), [])
    // "Check again": now, whatever the spacing between route changes' checks.
    const recheck = useCallback(async (): Promise<RecheckOutcome> => (watching.current ? watching.current.recheck(true) : "failed"), [])
    return { status, retry, reset: status === "in" && probed ? probed.reset : null, recheck }
}
