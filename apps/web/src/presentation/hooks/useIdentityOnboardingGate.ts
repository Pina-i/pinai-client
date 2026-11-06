import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"

import { forcesRecheck, routeRechecks, withdrawalRechecks, type KeptWordsReset } from "@pinai/domain/models/admission"
import type { ActorUri } from "@pinai/domain/models/e2ee"
import { gateDecisionUseCase, type GateDecision } from "@pinai/domain/usecases/e2ee/gate-this-device.usecase"
import { getE2eePort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { GATE_PAGES } from "@/presentation/_libs/gate-pages"
import { warnOf } from "@/presentation/_libs/key-share-deps"
import type { RecheckOutcome } from "@/presentation/providers/HistoryResetProvider/HistoryReset.context"
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

function checkThisDevice(idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<GateDecision> {
    return gateDecisionUseCase(admissionDeps())(idpUrl, accessToken, actorUri)
}

/**
 * Onboarding gate: only a device that is in reaches the app (`gateDecisionUseCase`); any other
 * goes to setup, the new-device page or the reset page. It checks as the layout mounts — a reload,
 * a sign-in —, then in the background: at a route change (`routeRechecks`), at once when the device
 * hears its key changed (`forcesRecheck`) or stops hearing it (`withdrawalRechecks`), and when asked
 * (`recheck`). The newest check decides, `reset` with it; one that fails changes nothing.
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
    const probeKey =
        signedIn && idpUrl && ownActorUri ? `${idpUrl}|${ownActorUri}|${retryNonce}` : null
    const [probed, setProbed] = useState<{ key: string; status: GateStatus; reset: KeptWordsReset | null } | null>(null)
    const current = probeKey !== null && probed?.key === probeKey ? probed : null
    const status: GateStatus = current?.status ?? "loading"
    const lastCheckAt = useRef<number | null>(null)
    const recheck = useRef<((force: boolean) => Promise<RecheckOutcome>) | null>(null)
    const routeSeen = useRef<string | null>(null)

    useEffect(() => {
        const accessToken = useAppStore.getState().accessToken
        if (probeKey === null || !accessToken || !idpUrl || !ownActorUri) return
        const setStatus = (next: GateStatus, reset: KeptWordsReset | null = null) => setProbed({ key: probeKey, status: next, reset })
        let cancelled = false
        ;(async () => {
            try {
                const port = getE2eePort()
                if (await port.hasLocalIdentity()) {
                    // Storage is opened per account by the route guard: another binding is the wrong account's.
                    const bound = await port.getBoundActorUri()
                    if (bound !== null && bound !== ownActorUri) {
                        // eslint-disable-next-line no-console
                        console.warn(
                            `Onboarding gate: wiping IDB — stored identity is bound to ${bound} but ${ownActorUri} is logged in`,
                        )
                        await port.wipeLocalDevice()
                        if (cancelled) return
                        // The persisted cache was hydrated with the other account's messages: only a reload drops them.
                        if (typeof window !== "undefined") {
                            window.location.reload()
                        }
                        return
                    }
                }
                const { route, reset } = await checkThisDevice(idpUrl, accessToken, ownActorUri)
                if (cancelled) return
                lastCheckAt.current = Date.now()
                if (route === "app") {
                    setStatus("ready", reset)
                    return
                }
                setStatus("redirecting")
                void navigate({ to: GATE_PAGES[route] })
            } catch (e) {
                if (cancelled) return
                // eslint-disable-next-line no-console
                console.warn("Identity onboarding gate probe failed:", e)
                setStatus("error")
            }
        })()
        return () => {
            // No ref guard on re-entry: under strict mode the cleanup runs between two invocations
            // on the same mount, and a guard would strand the gate at "loading".
            cancelled = true
        }
    }, [probeKey, idpUrl, ownActorUri, navigate])

    useEffect(() => {
        if (status !== "ready" || probeKey === null || !idpUrl || !ownActorUri) return
        let live = true
        let running = 0
        let newest = 0
        const check = async (force: boolean): Promise<RecheckOutcome> => {
            const accessToken = useAppStore.getState().accessToken
            if (!live || !accessToken) return "failed"
            const now = Date.now()
            if (!force && !routeRechecks({ running: running > 0, lastAt: lastCheckAt.current, now })) return "failed"
            lastCheckAt.current = now
            running += 1
            const seq = ++newest
            try {
                const { route, reset, offline } = await checkThisDevice(idpUrl, accessToken, ownActorUri)
                if (live && seq === newest && useAppStore.getState().accessToken) {
                    if (route === "app") {
                        setProbed({ key: probeKey, status: "ready", reset })
                    } else {
                        setProbed({ key: probeKey, status: "redirecting", reset: null })
                        void navigate({ to: GATE_PAGES[route] })
                    }
                }
                return offline ? "offline" : "checked"
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn("Identity onboarding gate check failed; the last one stands:", e)
                return "failed"
            } finally {
                running -= 1
            }
        }
        recheck.current = check
        // The events already standing are replayed as it subscribes: the probe has just weighed them.
        let replaying = true
        const port = getE2eePort()
        const stopTold = port.onTrustEvent((event) => {
            if (!replaying && forcesRecheck(event)) void check(true)
        })
        const stopWithdrawn = port.onTrustWithdrawn((event) => {
            if (!forcesRecheck(event)) return
            port.pendingHistoryKey().then((pending) => {
                if (withdrawalRechecks(event, pending, Date.now())) void check(true)
            }, warnOf("reading the pending history key"))
        })
        replaying = false
        return () => {
            live = false
            recheck.current = null
            stopTold()
            stopWithdrawn()
        }
    }, [status, probeKey, idpUrl, ownActorUri, navigate])

    useEffect(() => {
        const previous = routeSeen.current
        routeSeen.current = pathname
        if (previous !== null && previous !== pathname) void recheck.current?.(false)
    }, [pathname])

    const recheckNow = useCallback(async (): Promise<RecheckOutcome> => (await recheck.current?.(true)) ?? "failed", [])

    return {
        status,
        retry:
            status === "error"
                ? () => setRetryNonce((n) => n + 1)
                : null,
        reset: status === "ready" ? (current?.reset ?? null) : null,
        recheck: recheckNow,
    }
}
