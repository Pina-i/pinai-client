import { useEffect, useRef, useState } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"

import { forcesRecheck, routeRechecks, type GateRoute } from "@pinai/domain/models/admission"
import type { ActorUri } from "@pinai/domain/models/e2ee"
import { gateThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/gate-this-device.usecase"
import { getE2eePort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { GATE_PAGES } from "@/presentation/_libs/gate-pages"
import { useAppStore } from "@/store/store"

export type GateStatus = "loading" | "ready" | "redirecting" | "error"

export interface GateResult {
    status: GateStatus
    /** Only non-null when status === "error". Allows the layout to surface a retry. */
    retry: (() => void) | null
}

function checkThisDevice(idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<GateRoute> {
    return gateThisDeviceUseCase(admissionDeps())(idpUrl, accessToken, actorUri)
}

/**
 * Onboarding gate: only a device that is in reaches the app (`gateThisDeviceUseCase`); any other
 * goes to setup, the new-device page or the reset page. It checks as the layout mounts — a reload,
 * a sign-in —, then in the background: at a route change (`routeRechecks`), and at once when the
 * device hears its key changed (`forcesRecheck`). The newest check decides; one that fails changes
 * nothing.
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
    const [probed, setProbed] = useState<{ key: string; status: GateStatus } | null>(null)
    const status: GateStatus = probeKey !== null && probed?.key === probeKey ? probed.status : "loading"
    const lastCheckAt = useRef<number | null>(null)
    const recheck = useRef<((force: boolean) => void) | null>(null)
    const routeSeen = useRef<string | null>(null)

    useEffect(() => {
        const accessToken = useAppStore.getState().accessToken
        if (probeKey === null || !accessToken || !idpUrl || !ownActorUri) return
        const setStatus = (next: GateStatus) => setProbed({ key: probeKey, status: next })
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
                const route = await checkThisDevice(idpUrl, accessToken, ownActorUri)
                if (cancelled) return
                lastCheckAt.current = Date.now()
                if (route === "app") {
                    setStatus("ready")
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
        const check = (force: boolean) => {
            const accessToken = useAppStore.getState().accessToken
            if (!live || !accessToken) return
            const now = Date.now()
            if (!force && !routeRechecks({ running: running > 0, lastAt: lastCheckAt.current, now })) return
            lastCheckAt.current = now
            running += 1
            const seq = ++newest
            checkThisDevice(idpUrl, accessToken, ownActorUri)
                .then((route) => {
                    if (!live || seq !== newest || route === "app" || !useAppStore.getState().accessToken) return
                    setProbed({ key: probeKey, status: "redirecting" })
                    void navigate({ to: GATE_PAGES[route] })
                })
                .catch((e: unknown) => {
                    // eslint-disable-next-line no-console
                    console.warn("Identity onboarding gate check failed; the last one stands:", e)
                })
                .finally(() => {
                    running -= 1
                })
        }
        recheck.current = check
        // The events already standing are replayed as it subscribes: the probe has just weighed them.
        let replaying = true
        const stop = getE2eePort().onTrustEvent((event) => {
            if (!replaying && forcesRecheck(event)) check(true)
        })
        replaying = false
        return () => {
            live = false
            recheck.current = null
            stop()
        }
    }, [status, probeKey, idpUrl, ownActorUri, navigate])

    useEffect(() => {
        const previous = routeSeen.current
        routeSeen.current = pathname
        if (previous !== null && previous !== pathname) recheck.current?.(false)
    }, [pathname])

    return {
        status,
        retry:
            status === "error"
                ? () => setRetryNonce((n) => n + 1)
                : null,
    }
}
