import { IdpError } from "@pinai/domain/models/idp-error"
import { linkSessionDeviceUseCase } from "@pinai/domain/usecases/auth/link-session-device.usecase"
import { getE2eePort, getSessionPort } from "@/ioc/index"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { useAppStore } from "@/store/store"

let settled = false
let running = false

/**
 * Registers this device again when it has to, then tells the IdP which device this page's session
 * signed in, from `requireSession` once the account's storage is open: once per page load, and
 * not before the device exists. A naming refused — a revoked device — is final; `device_mismatch`
 * signs in afresh; an IdP out of reach is tried again at the next route.
 */
export function linkThisDevice(): void {
    const { idpUrl, accessToken, user } = useAppStore.getState()
    if (settled || running || !idpUrl || !accessToken || !user) return
    running = true
    linkSessionDeviceUseCase({ sessionPort: getSessionPort(), e2eePort: getE2eePort() })(
        idpUrl,
        accessToken,
        user.actor_uri,
    )
        .then(({ linked, registrationFailure }) => {
            settled = linked
            // eslint-disable-next-line no-console
            if (registrationFailure !== undefined) console.warn("Registering this device failed:", registrationFailure)
        })
        .catch(async (error: unknown) => {
            if (await signInAgainOnDeviceMismatch(error)) return
            settled = error instanceof IdpError
        })
        .finally(() => {
            running = false
        })
}
