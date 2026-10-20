import { IdpError } from "@pinai/domain/models/idp-error"
import { linkSessionDeviceUseCase } from "@pinai/domain/usecases/auth/link-session-device.usecase"
import { getE2eePort, getSessionPort } from "@/ioc/index"
import { useAppStore } from "@/store/store"

let settled = false
let running = false

/**
 * Tells the IdP which device this page's session signed in, from `requireSession` once the
 * account's storage is open: once per page load, and not before the device exists. A refusal
 * — a revoked device — is final; an IdP out of reach is tried again at the next route.
 */
export function linkThisDevice(): void {
    const { idpUrl, accessToken } = useAppStore.getState()
    if (settled || running || !idpUrl || !accessToken) return
    running = true
    linkSessionDeviceUseCase({ sessionPort: getSessionPort(), e2eePort: getE2eePort() })(idpUrl, accessToken)
        .then((linked) => {
            settled = linked
        })
        .catch((error: unknown) => {
            settled = error instanceof IdpError
        })
        .finally(() => {
            running = false
        })
}
