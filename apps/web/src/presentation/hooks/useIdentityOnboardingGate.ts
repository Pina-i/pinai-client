import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"

import type { KeptWordsReset } from "@pinai/domain/models/admission"
import { gateDecisionUseCase } from "@pinai/domain/usecases/e2ee/gate-this-device.usecase"
import { OnboardingGate, type GateVerdict, type RecheckOutcome } from "@pinai/domain/usecases/e2ee/onboarding-gate.usecase"
import { getE2eePort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { GATE_PAGES } from "@/presentation/_libs/gate-pages"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useAppStore } from "@/store/store"

export type GateStatus = "loading" | "ready" | "redirecting" | "error"

export interface GateResult {
    status: GateStatus
    /** Only non-null when status === "error". Allows the layout to surface a retry. */
    retry: (() => void) | null
    /** In by the words it kept over a reset it didn't make: why, for the app's banner. */
    reset: KeptWordsReset | null
    /** Checks again at once, as after a step the banner's user took; answers how that check went. */
    recheck: () => Promise<RecheckOutcome>
}

/**
 * The domain's `OnboardingGate` on the web: its probe as the layout mounts — a reload, a sign-in —, a
 * route change asking it again, the pages it sends to, a reload once it wiped another account's device.
 */
export function useIdentityOnboardingGate(): GateResult {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const ownActorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const pathname = useRouterState({ select: (s) => s.location.pathname })
    const navigate = useNavigate()
    const [retryNonce, setRetryNonce] = useState(0)

    // The probe result is tagged with the session + attempt it belongs to, and read back only on a
    // match: a result probed for one account is never shown to the next one to sign in here.
    const probeKey = signedIn && idpUrl && ownActorUri ? `${idpUrl}|${ownActorUri}|${retryNonce}` : null
    const [probed, setProbed] = useState<{ key: string; status: GateStatus; reset: KeptWordsReset | null } | null>(null)
    const current = probeKey !== null && probed?.key === probeKey ? probed : null
    const status: GateStatus = current?.status ?? "loading"
    const watching = useRef<OnboardingGate | null>(null)
    const routeSeen = useRef<string | null>(null)

    useEffect(() => {
        if (probeKey === null || !useAppStore.getState().accessToken || !idpUrl || !ownActorUri) return
        const gate = new OnboardingGate({
            e2eePort: getE2eePort(),
            decide: gateDecisionUseCase(admissionDeps()),
            session: () => {
                const accessToken = useAppStore.getState().accessToken
                return accessToken ? { idpUrl, accessToken, actorUri: ownActorUri } : null
            },
            warn: (what, error) => warnE2ee(`onboarding gate: ${what}`, error ?? ""),
        })
        const show = (verdict: GateVerdict) => {
            if (verdict.kind === "in") {
                setProbed({ key: probeKey, status: "ready", reset: verdict.reset })
            } else if (verdict.kind === "go") {
                gate.close()
                if (watching.current === gate) watching.current = null
                setProbed({ key: probeKey, status: "redirecting", reset: null })
                void navigate({ to: GATE_PAGES[verdict.route] })
            }
        }
        // No ref guard on re-entry: under strict mode the cleanup runs between two invocations
        // on the same mount, and a guard would strand the gate at "loading".
        let cancelled = false
        void gate.probe().then((verdict) => {
            if (cancelled) return
            if (verdict.kind === "wiped") {
                // The persisted cache was hydrated with the other account's messages: only a reload drops them.
                if (typeof window !== "undefined") window.location.reload()
                return
            }
            if (verdict.kind === "failed") {
                setProbed({ key: probeKey, status: "error", reset: null })
                return
            }
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
    }, [probeKey, idpUrl, ownActorUri, navigate])

    useEffect(() => {
        const previous = routeSeen.current
        routeSeen.current = pathname
        if (previous !== null && previous !== pathname) void watching.current?.recheck(false)
    }, [pathname])

    const recheckNow = useCallback(async (): Promise<RecheckOutcome> => (await watching.current?.recheck(true)) ?? "failed", [])

    return {
        status,
        retry: status === "error" ? () => setRetryNonce((n) => n + 1) : null,
        reset: status === "ready" ? (current?.reset ?? null) : null,
        recheck: recheckNow,
    }
}
