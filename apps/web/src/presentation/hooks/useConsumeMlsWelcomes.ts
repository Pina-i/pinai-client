import { useEffect } from "react"

import { getE2eePort } from "@/ioc"
import { useAppStore } from "@/store/store"

/**
 * Polls `GET /api/mls/welcomes` once on login (and any time the
 * authentication state changes) and joins each pending MLS group
 * locally. Mounted from the authenticated layout alongside
 * {@link useIdpWebSocket}.
 *
 * Phase 5b foundation polls only on login; future revisions wire it
 * to the `MlsWelcomeReady` WS event (see `useIdpWebSocket.ts`) so
 * inbound welcomes land within seconds rather than waiting for the
 * next reload.
 */
export function useConsumeMlsWelcomes(): void {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const idpUrl = useAppStore((s) => s.idpUrl)
    // The canonical actor URI is sourced from `/userinfo` — never
    // re-derive client-side, otherwise a browser reaching the IdP via
    // a different host than its configured DOMAIN binds the MLS
    // provider's signing key to a mismatched leaf credential.
    const ownActorUri = useAppStore((s) => s.user?.actor_uri ?? null)

    useEffect(() => {
        const accessToken = useAppStore.getState().accessToken
        if (!accessToken || !idpUrl || !ownActorUri) return

        let cancelled = false
        ;(async () => {
            try {
                const result = await getE2eePort().consumePendingWelcomes(
                    idpUrl,
                    accessToken,
                    ownActorUri,
                )
                if (!cancelled && result.joined > 0) {
                    // eslint-disable-next-line no-console
                    console.info(`Joined ${result.joined} MLS group(s) from pending welcomes`)
                }
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn("MLS welcome consumption failed:", e)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [signedIn, idpUrl, ownActorUri])
}
