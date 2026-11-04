import { useEffect } from "react"

import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { registerKeyPackagesLowHandler } from "@/presentation/hooks/useIdpWebSocket"
import { useAppStore } from "@/store/store"
import {
    KEY_PACKAGE_REFILL_INTERVAL_MS,
    replenishKeyPackagesUseCase,
} from "@pinai/domain/usecases/e2ee/replenish-keypackages.usecase"

/**
 * Keeps this device addable to groups: renews its attestation when due, then — while it is in —
 * tops its KeyPackage stash up, on entering the app, every 6 h and on `key_packages_low`. Enabled
 * once the gate lets the device in; one that turned out since refills nothing
 * (`replenishKeyPackagesUseCase`).
 */
export function useReplenishKeyPackages(enabled: boolean): void {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const ownActorUri = useAppStore((s) => s.user?.actor_uri ?? null)

    useEffect(() => {
        if (!enabled || !idpUrl || !ownActorUri) return
        const replenish = replenishKeyPackagesUseCase(admissionDeps())
        // The token is read per run so that refreshing it doesn't restart the timer.
        const run = () => {
            const accessToken = useAppStore.getState().accessToken
            if (!accessToken) return
            replenish({ idpUrl, accessToken, actorUri: ownActorUri })
                .then(async ({ renewalFailure }) => {
                    if (renewalFailure === undefined || (await signInAgainOnDeviceMismatch(renewalFailure))) return
                    // eslint-disable-next-line no-console
                    console.warn("Attestation renewal failed; tried again at the next tick:", renewalFailure)
                })
                .catch((e) => {
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
