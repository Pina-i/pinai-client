import type { ActorUri } from "../../models/e2ee"
import { isDeviceMismatch } from "../../models/idp-error"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { ISessionPort } from "../../ports/session.port"

/**
 * Tells the IdP which device this session signed in, once the device exists — on a first
 * sign-in it is created by the onboarding that follows. The device registers again first when it
 * has to — its attestation near its end, or no HPKE key yet —, as the spec has a device name its
 * session right after registering. A registration that fails is tried again at the next page load
 * or KeyPackage tick, and names the device all the same — but for `device_mismatch`, thrown: the
 * session is another device's. Whether it was linked, and why the registration failed.
 */
export function linkSessionDeviceUseCase(deps: { sessionPort: ISessionPort; e2eePort: IE2eePort }) {
    return async (
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ linked: boolean; registrationFailure?: unknown }> => {
        if (!(await deps.e2eePort.hasLocalIdentity())) return { linked: false }
        let registrationFailure: unknown
        try {
            await deps.e2eePort.registerDevice(idpUrl, accessToken, actorUri)
        } catch (error) {
            if (isDeviceMismatch(error)) throw error
            registrationFailure = error
        }
        await deps.sessionPort.linkDevice(idpUrl, accessToken, await deps.e2eePort.getDeviceId())
        return registrationFailure === undefined ? { linked: true } : { linked: true, registrationFailure }
    }
}
