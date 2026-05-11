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
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const userAddress = useAppStore((s) => s.user?.address ?? null)

    useEffect(() => {
        if (!accessToken || !idpUrl || !userAddress) return
        // The actor URI is the recipient's federation form; we have
        // the address (`username@host`) — convert back to URI shape
        // used by the e2ee port. The format is the canonical
        // `<scheme>://<host>/users/<username>`. `idpUrl` already
        // carries the scheme + host.
        const username = userAddress.split("@")[0]
        const ownActorUri = `${idpUrl.replace(/\/$/, "")}/users/${username}`

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
    }, [accessToken, idpUrl, userAddress])
}
