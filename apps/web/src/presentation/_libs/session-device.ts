import { startThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/start-this-device.usecase"
import { ThisDeviceStart } from "@pinai/domain/usecases/e2ee/this-device-start.usecase"
import { getDeviceDirectoryPort, getE2eePort, getHistoryArchivePort, getKeySharePort, getSessionPort } from "@/ioc/index"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"
import { pendingKeyLock } from "@/presentation/_libs/pending-key-lock"
import { useAppStore } from "@/store/store"

// One per page load.
const thisDevice = new ThisDeviceStart({
    start: (idpUrl, accessToken, actorUri) =>
        startThisDeviceUseCase({
            sessionPort: getSessionPort(),
            e2eePort: getE2eePort(),
            historyArchivePort: getHistoryArchivePort(),
            deviceDirectoryPort: getDeviceDirectoryPort(),
            keySharePort: getKeySharePort(),
            report: warnE2ee,
            pendingKeyLock: pendingKeyLock(actorUri),
        })(idpUrl, accessToken, actorUri),
    session: () => {
        const { idpUrl, accessToken, user } = useAppStore.getState()
        return idpUrl && accessToken && user ? { idpUrl, accessToken, actorUri: user.actor_uri } : null
    },
    signInAgainOnDeviceMismatch,
    // eslint-disable-next-line no-console
    warn: (what, error) => console.warn(`This device: ${what}:`, error),
})

/** From `requireSession` once the account's storage is open: `ThisDeviceStart`, once per page load. */
export function linkThisDevice(): void {
    void thisDevice.run()
}
