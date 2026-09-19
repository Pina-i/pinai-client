import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"

import { getE2eePort, getHistoryArchivePort } from "@/ioc"
import { useAppStore } from "@/store/store"

export type GateDecision = "app" | "setup" | "restore"
export type GateStatus = "loading" | "ready" | "redirecting" | "error"

/**
 * Three branches:
 *  - local identity present → admit to the app
 *  - no local identity, no server-side history salt → first device for the account → setup
 *  - no local identity, salt exists → another device has set up the passphrase already → restore
 */
export function decideGateRoute(probe: {
    hasLocal: boolean
    hasArchive: boolean
}): GateDecision {
    if (probe.hasLocal) return "app"
    return probe.hasArchive ? "restore" : "setup"
}

export interface GateResult {
    status: GateStatus
    /** Only non-null when status === "error". Allows the layout to surface a retry. */
    retry: (() => void) | null
}

/**
 * Onboarding gate. Probes local identity; on a fresh device, also probes
 * the server for an existing history-archive salt so a returning user
 * (signed in on a new device) lands on the restore flow instead of
 * being asked to mint a new passphrase that would orphan their backup.
 */
export function useIdentityOnboardingGate(): GateResult {
    const accessToken = useAppStore((s) => s.accessToken)
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
        accessToken && idpUrl && ownActorUri ? `${idpUrl}|${ownActorUri}|${retryNonce}` : null
    const [probed, setProbed] = useState<{ key: string; status: GateStatus } | null>(null)
    const status: GateStatus = probeKey !== null && probed?.key === probeKey ? probed.status : "loading"

    useEffect(() => {
        if (probeKey === null || !accessToken || !idpUrl || !ownActorUri) return
        const setStatus = (next: GateStatus) => setProbed({ key: probeKey, status: next })
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

                // Fresh device: ask the server whether the account
                // already has a history-archive salt. Treat any error
                // as "no salt" so a transient failure doesn't trap the
                // user on the gate — worst case they land on setup and
                // can re-run restore manually from Settings.
                let hasArchive = false
                try {
                    const salt = await getHistoryArchivePort().getSalt(idpUrl, accessToken)
                    hasArchive = salt !== null
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.warn("Gate: history-salt probe failed; falling through to setup", e)
                }

                if (cancelled) return
                const decision = decideGateRoute({ hasLocal: false, hasArchive })
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
    }, [probeKey, accessToken, idpUrl, ownActorUri, navigate])

    return {
        status,
        retry:
            status === "error"
                ? () => setRetryNonce((n) => n + 1)
                : null,
    }
}
