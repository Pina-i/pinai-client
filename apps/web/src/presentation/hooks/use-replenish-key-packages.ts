import { useEffect } from "react"

import { getE2eePort } from "@/ioc"
import { registerKeyPackagesLowHandler } from "@/presentation/hooks/useIdpWebSocket"
import { useAppStore } from "@/store/store"
import {
    KEY_PACKAGE_REFILL_INTERVAL_MS,
    replenishKeyPackagesUseCase,
} from "@pinai/domain/usecases/e2ee/replenish-keypackages.usecase"

/**
 * Keeps this device addable to groups: tops its KeyPackage stash up on entering the app, every 6 h
 * and on `key_packages_low`. Only once the gate admits the device — before, it has no identity.
 */
export function useReplenishKeyPackages(enabled: boolean): void {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const ownActorUri = useAppStore((s) => s.user?.actor_uri ?? null)

    useEffect(() => {
        if (!enabled || !idpUrl || !ownActorUri) return
        const replenish = replenishKeyPackagesUseCase({ e2eePort: getE2eePort() })
        // The token is read per run so that refreshing it doesn't restart the timer.
        const run = () => {
            const accessToken = useAppStore.getState().accessToken
            if (!accessToken) return
            replenish({ idpUrl, accessToken, actorUri: ownActorUri }).catch((e) => {
                // eslint-disable-next-line no-console
                console.warn("KeyPackage refill failed:", e)
            })
        }
        run()
        const timer = setInterval(run, KEY_PACKAGE_REFILL_INTERVAL_MS)
        const unregister = registerKeyPackagesLowHandler(run)
        return () => {
            clearInterval(timer)
            unregister()
        }
    }, [enabled, idpUrl, ownActorUri])
}
