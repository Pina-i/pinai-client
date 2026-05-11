import { useEffect } from "react"

import { actorUriToAddress } from "@/domain/models/identity"
import type { ActorUri, Fingerprint } from "@/domain/models/e2ee"
import { getE2eePort } from "@/ioc"
import { useAppStore } from "@/store/store"

/**
 * Resolve the MSK fingerprint for an `actor_uri`. Reads the
 * zustand cache; on miss, fires a one-shot fetch to populate it.
 *
 * Pass `null` / `undefined` to short-circuit (e.g. while the calling
 * component still resolves the actor URI). Local-user fingerprints
 * are computed from the on-device identity bundle; peer fingerprints
 * come from `GET /api/keys/identity/:actor_uri`.
 *
 * Returns `null` until the cache is populated. Re-renders flow
 * naturally through zustand once the fetch completes.
 */
export function useFingerprint(actorUri: ActorUri | null | undefined): Fingerprint | null {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const accessToken = useAppStore((s) => s.accessToken)
    const ownAddress = useAppStore((s) => s.user?.address ?? null)

    const cached = useAppStore((s) =>
        actorUri ? s.fingerprintsByActorUri[actorUri] ?? null : null,
    )
    const setFingerprint = useAppStore((s) => s.setFingerprint)

    useEffect(() => {
        if (!actorUri || cached) return
        let cancelled = false

        const fetchFingerprint = async () => {
            const port = getE2eePort()
            try {
                // The user profile carries the federated address
                // (`username@host`) but not the actor URI — compare
                // by deriving the address form on both sides.
                const isLocalUser = ownAddress != null && actorUriToAddress(actorUri) === ownAddress
                const fingerprint = isLocalUser
                    ? await port.getOwnFingerprint()
                    : idpUrl && accessToken
                        ? await port.getPeerFingerprint(idpUrl, accessToken, actorUri)
                        : null
                if (!cancelled && fingerprint) {
                    setFingerprint(actorUri, fingerprint)
                }
            } catch (e) {
                // Soft fail: leave the cache empty, hook returns null,
                // the UI shows a "not yet available" placeholder.
                // eslint-disable-next-line no-console
                console.warn("useFingerprint: fetch failed", e)
            }
        }

        void fetchFingerprint()
        return () => {
            cancelled = true
        }
    }, [actorUri, cached, ownAddress, idpUrl, accessToken, setFingerprint])

    return cached
}
