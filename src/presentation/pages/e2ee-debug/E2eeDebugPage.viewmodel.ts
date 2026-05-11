import { useEffect, useState } from "react"

import type { Fingerprint, KeyPackageStatusResponse } from "@/domain/models/e2ee"
import { getE2eePort } from "@/ioc"
import { useAppStore } from "@/store/store"

/**
 * Debug panel data — gated on `import.meta.env.DEV`. Shows enough state
 * to verify the E2EE plumbing without spelunking through DevTools:
 * - own MSK fingerprint
 * - cached peer fingerprints
 * - per-device KeyPackage stash counts (from the server)
 *
 * Read-only. Mutations land via the regular flows (register, replenish,
 * pair-device etc.).
 */
export interface E2eeDebugViewModel {
    ownFingerprint: Fingerprint | null
    fingerprintsByActorUri: Record<string, Fingerprint>
    keyPackageStatus: KeyPackageStatusResponse | null
    statusError: string | null
    refreshing: boolean
    refresh: () => void
}

export function useE2eeDebugViewModel(): E2eeDebugViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const accessToken = useAppStore((s) => s.accessToken)
    const fingerprintsByActorUri = useAppStore((s) => s.fingerprintsByActorUri)

    const [ownFingerprint, setOwnFingerprint] = useState<Fingerprint | null>(null)
    const [keyPackageStatus, setKeyPackageStatus] = useState<KeyPackageStatusResponse | null>(null)
    const [statusError, setStatusError] = useState<string | null>(null)
    const [refreshing, setRefreshing] = useState(false)
    const [version, setVersion] = useState(0)

    useEffect(() => {
        let cancelled = false
        const port = getE2eePort()

        const run = async () => {
            setRefreshing(true)
            setStatusError(null)
            try {
                const fp = await port.getOwnFingerprint()
                if (!cancelled) setOwnFingerprint(fp)

                if (idpUrl && accessToken) {
                    const status = await port.replenishKeyPackages(idpUrl, accessToken)
                    if (!cancelled) setKeyPackageStatus(status)
                }
            } catch (e) {
                if (!cancelled) {
                    setStatusError(e instanceof Error ? e.message : String(e))
                }
            } finally {
                if (!cancelled) setRefreshing(false)
            }
        }

        void run()
        return () => {
            cancelled = true
        }
    }, [idpUrl, accessToken, version])

    return {
        ownFingerprint,
        fingerprintsByActorUri,
        keyPackageStatus,
        statusError,
        refreshing,
        refresh: () => setVersion((v) => v + 1),
    }
}
