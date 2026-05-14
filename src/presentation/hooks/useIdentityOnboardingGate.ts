import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"

import { addressToActorUri } from "@/domain/models/identity"
import { getE2eePort } from "@/ioc"
import { useAppStore } from "@/store/store"

export type GateDecision = "app" | "setup"
export type GateStatus = "loading" | "ready" | "redirecting" | "error"

/**
 * Pure decision: given local-identity presence, where should the user
 * land?
 *
 * Phase 7 — two branches only. The previous "restore" branch (recover
 * MSK from server-stored passphrase blob) is gone. Per-device identity
 * is the model now: a brand-new device on an existing account just
 * generates its own MSK + DRK in the setup flow. Friends see no
 * cryptographic continuity, which is what mass-market users intuit
 * from Signal/iMessage already.
 *
 * The `hasServerIdentity` and `hasServerBlob` probes used to gate this
 * decision are no longer needed — the gate skips them.
 */
export function decideGateRoute(probe: { hasLocal: boolean }): GateDecision {
    return probe.hasLocal ? "app" : "setup"
}

export interface GateResult {
    status: GateStatus
    /** Only non-null when status === "error". Allows the layout to surface a retry. */
    retry: (() => void) | null
}

/**
 * Phase 6a — the identity onboarding gate.
 *
 * Decides whether the just-logged-in user can enter the app shell, or
 * needs to land on one of the two onboarding routes first. Drives the
 * `decideGateRoute` table by probing local IDB + server state, and
 * issues a TanStack Router navigate to the chosen destination.
 *
 * Returns `{ status, retry }`:
 *   - "loading"    — initial probe in flight
 *   - "ready"      — local identity present, app shell may render
 *   - "redirecting"— a navigate has been issued to /onboarding/...
 *   - "error"      — probe network/storage error; caller surfaces retry
 *
 * Idempotent + strict-mode-safe via an internal ref that dedupes
 * concurrent probes.
 */
export function useIdentityOnboardingGate(): GateResult {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const userAddress = useAppStore((s) => s.user?.address ?? null)
    const navigate = useNavigate()
    const [status, setStatus] = useState<GateStatus>("loading")
    const [retryNonce, setRetryNonce] = useState(0)

    useEffect(() => {
        if (!accessToken || !idpUrl || !userAddress) {
            setStatus("loading")
            return
        }
        const ownActorUri = addressToActorUri(userAddress, idpUrl)
        if (!ownActorUri) {
            setStatus("error")
            return
        }
        let cancelled = false
        ;(async () => {
            try {
                const port = getE2eePort()
                if (await port.hasLocalIdentity()) {
                    // Cross-account contamination check. If the stored
                    // identity is bound to a different actor URI (e.g.
                    // a previous user signed out without clearing IDB),
                    // wipe everything so the new user gets the standard
                    // onboarding flow rather than silently inheriting
                    // someone else's keys.
                    const bound = await port.getBoundActorUri()
                    if (bound === null || bound === ownActorUri) {
                        if (!cancelled) setStatus("ready")
                        return
                    }
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
                // Phase 7 — no local identity → always route to setup.
                // The legacy server-identity / server-blob probes are gone
                // (the Phase 6a restore branch is dropped).
                const decision = decideGateRoute({ hasLocal: false })
                if (decision === "app") {
                    setStatus("ready")
                } else {
                    setStatus("redirecting")
                    void navigate({ to: "/onboarding/recovery-setup" })
                }
                void ownActorUri // retained for future use; the gate no longer probes the server
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
    }, [accessToken, idpUrl, userAddress, navigate, retryNonce])

    return {
        status,
        retry:
            status === "error"
                ? () => {
                      setStatus("loading")
                      setRetryNonce((n) => n + 1)
                  }
                : null,
    }
}
