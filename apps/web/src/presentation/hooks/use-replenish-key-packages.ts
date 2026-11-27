import { useEffect } from "react"

import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { registerKeyPackagesLowHandler } from "@/presentation/hooks/useIdpWebSocket"
import { useAppStore } from "@/store/store"
import { KeyPackageTick, replenishKeyPackagesUseCase } from "@pinai/domain/usecases/e2ee/replenish-keypackages.usecase"

/**
 * The domain's `KeyPackageTick` while the gate lets the device in: its attestation renewed when due, its stash topped
 * up. One that turned out since refills nothing (`replenishKeyPackagesUseCase`).
 */
export function useReplenishKeyPackages(enabled: boolean): void {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const ownActorUri = useAppStore((s) => s.user?.actor_uri ?? null)

    useEffect(() => {
        if (!enabled || !idpUrl || !ownActorUri) return
        const tick = new KeyPackageTick({
            session: { idpUrl, actorUri: ownActorUri, accessToken: () => useAppStore.getState().accessToken },
            replenish: replenishKeyPackagesUseCase(admissionDeps()),
            renewalFailed: async (failure) => {
                if (!(await signInAgainOnDeviceMismatch(failure))) warnE2ee("renewing the attestation, tried again at the next tick", failure)
            },
            report: warnE2ee,
        })
        tick.start()
        const unregister = registerKeyPackagesLowHandler(() => tick.low())
        return () => {
            unregister()
            tick.stop()
        }
    }, [enabled, idpUrl, ownActorUri])
}
