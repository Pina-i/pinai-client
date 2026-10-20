import type { IE2eePort } from "../../ports/e2ee.port"
import type { ISessionPort } from "../../ports/session.port"

/**
 * Tells the IdP which device this session signed in, once the device exists — on a first
 * sign-in it is created by the onboarding that follows. Whether it was linked.
 */
export function linkSessionDeviceUseCase(deps: { sessionPort: ISessionPort; e2eePort: IE2eePort }) {
    return async (idpUrl: string, accessToken: string): Promise<boolean> => {
        if (!(await deps.e2eePort.hasLocalIdentity())) return false
        await deps.sessionPort.linkDevice(idpUrl, accessToken, await deps.e2eePort.getDeviceId())
        return true
    }
}
