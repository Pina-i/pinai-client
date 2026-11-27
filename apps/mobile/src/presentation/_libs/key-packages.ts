import { KeyPackageTick, replenishKeyPackagesUseCase } from "@pinai/domain/usecases/e2ee/replenish-keypackages.usecase"
import { useAppStore } from "@/store/store"
import { admissionDeps } from "./admission-deps"
import { signInAgainOnDeviceMismatch } from "./device-mismatch"
import { isSocketConnected, onSocketConnected, onSocketEvent } from "./socket"
import { warnE2ee } from "./warn-e2ee"

/**
 * The domain's `KeyPackageTick` while the device is in: its attestation renewed when due, its stash topped up — at
 * start, every 6 h, on `key_packages_low`. Without it the phone's siblings can't add it once its first stash is used.
 */
export function keepKeyPackagesStocked(): () => void {
    const { idpUrl, user } = useAppStore.getState()
    if (!idpUrl || !user) return () => undefined
    const tick = new KeyPackageTick({
        session: { idpUrl, actorUri: user.actor_uri, accessToken: () => useAppStore.getState().accessToken },
        replenish: replenishKeyPackagesUseCase(admissionDeps()),
        renewalFailed: async (failure) => {
            if (!(await signInAgainOnDeviceMismatch(failure))) warnE2ee("renewing the attestation, tried again at the next tick", failure)
        },
        report: warnE2ee,
    })
    // A connection up as it starts counts as the first: the start tops up as it would.
    let connects = isSocketConnected() ? 1 : 0
    const stops = [
        onSocketEvent((event) => {
            if (event.type === "key_packages_low") tick.low()
        }),
        // The socket closes in the background: a `key_packages_low` pushed meanwhile was lost.
        onSocketConnected(() => {
            if (connects++ > 0) tick.low()
        }),
    ]
    tick.start()
    return () => {
        stops.forEach((stop) => stop())
        tick.stop()
    }
}
