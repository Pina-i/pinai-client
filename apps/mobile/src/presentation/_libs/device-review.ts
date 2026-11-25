import { oneAtATime } from "@pinai/domain/lib/one-at-a-time"
import { syncOwnGroupsUseCase } from "@pinai/domain/usecases/e2ee/sync-own-groups.usecase"
import { getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { appVisibility } from "./app-visibility"
import { shareDeps } from "./share-deps"
import { onSocketConnected, onSocketEvent } from "./socket"
import { warnE2ee } from "./warn-e2ee"

/**
 * The account's devices read and judged by this device (`identity-provider/specs/e2ee.md § 3.9`): who arrived
 * unapproved, who approved whom, and the passphrase shared with a partner waiting for it. The phone holds no
 * group yet, so the sync runs with no conversation: the review and the shares only.
 */
export const reviewDevices = oneAtATime(async (): Promise<void> => {
    const { idpUrl, accessToken, user } = useAppStore.getState()
    if (!idpUrl || !accessToken || !user) return
    const { reviewFailure, shareFailure } = await syncOwnGroupsUseCase(idpUrl, accessToken, user.actor_uri, [], {
        e2ee: getE2eePort(),
        deviceDirectory: getDeviceDirectoryPort(),
        sharing: shareDeps(),
    })
    if (reviewFailure !== undefined) warnE2ee("reviewing the device list", reviewFailure)
    if (shareFailure !== undefined) warnE2ee("sharing the history passphrase; tried again at the next review", shareFailure)
})

function review(): void {
    reviewDevices().catch((error: unknown) => warnE2ee("reviewing the device list", error))
}

/** Reviewed at once, when a device joins or is approved, and when the socket or the app comes back. */
export function keepDevicesReviewed(): () => void {
    review()
    const stops = [
        onSocketEvent((event) => {
            if (event.type === "device_joined" || event.type === "device_approved") review()
        }),
        onSocketConnected(review),
        appVisibility.onChange(() => {
            if (appVisibility.visible()) review()
        }),
    ]
    return () => stops.forEach((stop) => stop())
}
