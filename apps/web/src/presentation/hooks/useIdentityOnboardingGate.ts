import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"

import { getE2eePort, getHistoryArchivePort } from "@/ioc"
import { useAppStore } from "@/store/store"

export type GateDecision = "app" | "setup" | "restore"
export type GateStatus = "loading" | "ready" | "redirecting" | "error"

/**
 * `hasHistoryKey` is `null` when the probe failed. An account with no key goes to setup, a local
 * identity or not — a first device cut short before its key was set resumes there — unless this
 * device saw a key before: generations only move forward.
 */
export function decideGateRoute(probe: {
    hasLocal: boolean
    hasHistoryKey: boolean | null
    sawHistoryKey: boolean
}): GateDecision {
    if (probe.hasHistoryKey === false && !probe.sawHistoryKey) return "setup"
    if (probe.hasLocal) return "app"
    return probe.hasHistoryKey ? "restore" : "setup"
}

export interface GateResult {
    status: GateStatus
    /** Only non-null when status === "error". Allows the layout to surface a retry. */
    retry: (() => void) | null
}

/**
 * Onboarding gate. Probes local identity; on a fresh device, also probes
 * the server for the account's history key so a returning user (signed
 * in on a new device) lands on the restore flow instead of being asked
 * to mint a new passphrase.
 */
export function useIdentityOnboardingGate(): GateResult {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const ownActorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const navigate = useNavigate()
    const [retryNonce, setRetryNonce] = useState(0)

    // The probe result is tagged with the session + attempt it belongs to, and
    // read back only on a match. "Loading" is therefore derived — the absence
    // of a result for the current key — rather than written from an effect.
    // It also closes a staleness hole: a result probed for one account can no
    // longer be shown to the next one to sign in on this device.
    const probeKey =
        signedIn && idpUrl && ownActorUri ? `${idpUrl}|${ownActorUri}|${retryNonce}` : null
    const [probed, setProbed] = useState<{ key: string; status: GateStatus } | null>(null)
    const status: GateStatus = probeKey !== null && probed?.key === probeKey ? probed.status : "loading"

    useEffect(() => {
        const accessToken = useAppStore.getState().accessToken
        if (probeKey === null || !accessToken || !idpUrl || !ownActorUri) return
        const setStatus = (next: GateStatus) => setProbed({ key: probeKey, status: next })
        let cancelled = false
        ;(async () => {
            try {
                const port = getE2eePort()
                const hasLocal = await port.hasLocalIdentity()
                if (hasLocal) {
                    // Storage is opened per account by the route guard, so a
                    // different binding means this store was bound to the
                    // wrong account. Wipe it rather than serve someone
                    // else's keys.
                    const bound = await port.getBoundActorUri()
                    if (bound !== null && bound !== ownActorUri) {
                        // eslint-disable-next-line no-console
                        console.warn(
                            `Onboarding gate: wiping IDB — stored identity is bound to ${bound} but ${ownActorUri} is logged in`,
                        )
                        await port.wipeLocalDevice()
                        if (cancelled) return
                        // Wiping IDB clears Alice's at-rest state, but the
                        // Zustand persist middleware already hydrated her
                        // message cache into memory at app boot (the
                        // device key was still hers at that point).
                        // Forcing a full reload is the only way to drop
                        // that in-memory state cleanly — falling through
                        // to a soft navigate would leave Pierre's session
                        // rendering Alice's last-seen DMs from memory.
                        if (typeof window !== "undefined") {
                            window.location.reload()
                        }
                        return
                    }
                }

                let hasHistoryKey: boolean | null = null
                try {
                    hasHistoryKey = (await getHistoryArchivePort().getKey(idpUrl, accessToken)) !== null
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.warn("Gate: history-key probe failed", e)
                }
                const sawHistoryKey = (await port.newestHistoryGeneration()) !== null

                if (cancelled) return
                const decision = decideGateRoute({ hasLocal, hasHistoryKey, sawHistoryKey })
                if (decision === "app") {
                    setStatus("ready")
                    return
                }
                setStatus("redirecting")
                const target =
                    decision === "restore"
                        ? "/onboarding/recovery-restore"
                        : "/onboarding/recovery-setup"
                void navigate({ to: target })
            } catch (e) {
                if (cancelled) return
                // eslint-disable-next-line no-console
                console.warn("Identity onboarding gate probe failed:", e)
                setStatus("error")
            }
        })()
        return () => {
            // Cancel in-flight work for this effect instance. We don't
            // gate re-entry with a ref because under React strict mode
            // the cleanup runs between two effect invocations on the
            // same mount; a ref-guarded "already probed" check would
            // make the second invocation no-op while the first was
            // cancelled, stranding the gate at status="loading".
            cancelled = true
        }
    }, [probeKey, idpUrl, ownActorUri, navigate])

    return {
        status,
        retry:
            status === "error"
                ? () => setRetryNonce((n) => n + 1)
                : null,
    }
}
