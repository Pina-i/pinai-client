import { IdpError } from "@pinai/domain/models/idp-error"
import { startThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/start-this-device.usecase"
import { getDeviceDirectoryPort, getE2eePort, getHistoryArchivePort, getSessionPort } from "@/ioc/index"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { useAppStore } from "@/store/store"

let settled = false
let running = false

/**
 * From `requireSession` once the account's storage is open: once per page load, and not before
 * the device exists, the session names its device, then the device's words are checked against
 * the history key (`startThisDeviceUseCase`). A naming refused — a revoked device — is final;
 * `device_mismatch` signs in afresh; an IdP out of reach is tried again at the next route.
 */
export function linkThisDevice(): void {
    const { idpUrl, accessToken, user } = useAppStore.getState()
    if (settled || running || !idpUrl || !accessToken || !user) return
    running = true
    startThisDeviceUseCase({
        sessionPort: getSessionPort(),
        e2eePort: getE2eePort(),
        historyArchivePort: getHistoryArchivePort(),
        deviceDirectoryPort: getDeviceDirectoryPort(),
    })(idpUrl, accessToken, user.actor_uri)
        .then(({ linked, registrationFailure, historyKeyFailure }) => {
            settled = linked && historyKeyFailure === undefined
            // eslint-disable-next-line no-console
            if (registrationFailure !== undefined) console.warn("Registering this device failed:", registrationFailure)
            // eslint-disable-next-line no-console
            if (historyKeyFailure !== undefined) console.warn("Checking the history key failed:", historyKeyFailure)
        })
        .catch(async (error: unknown) => {
            if (await signInAgainOnDeviceMismatch(error)) return
            settled = error instanceof IdpError
        })
        .finally(() => {
            running = false
        })
}
