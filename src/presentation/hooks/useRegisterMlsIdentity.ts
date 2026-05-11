import { useEffect } from "react"

import { addressToActorUri } from "@/domain/models/identity"
import { getE2eePort } from "@/ioc"
import { useAppStore } from "@/store/store"

/**
 * Idempotent post-login MLS bootstrap.
 *
 * Calls `IE2eePort.register(...)` on every authenticated mount. The
 * port is itself idempotent: if this device already has a stored
 * MSK / SSK / USK bundle the call short-circuits to a fingerprint
 * lookup + a KeyPackage refill against the IdP's per-device cap.
 *
 * Mounted in `_authenticated` ahead of `useConsumeMlsWelcomes` so the
 * sender's MLS leaf credential is bound to the local actor URI before
 * any group-bootstrap path can race in and bind it to a peer's URI.
 */
export function useRegisterMlsIdentity(): void {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const userAddress = useAppStore((s) => s.user?.address ?? null)

    useEffect(() => {
        if (!accessToken || !idpUrl || !userAddress) return
        const ownActorUri = addressToActorUri(userAddress, idpUrl)
        if (!ownActorUri) return

        let cancelled = false
        ;(async () => {
            try {
                const result = await getE2eePort().register(idpUrl, accessToken, ownActorUri)
                if (!cancelled) {
                    // eslint-disable-next-line no-console
                    console.info(
                        `MLS identity registered (device=${result.device_id.slice(0, 8)}…, fp=${result.fingerprint.slice(0, 8)}…)`,
                    )
                }
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn("MLS identity registration failed:", e)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [accessToken, idpUrl, userAddress])
}
