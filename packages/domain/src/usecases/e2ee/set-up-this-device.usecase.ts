import type { ActorUri } from "../../models/e2ee"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { ISessionPort } from "../../ports/session.port"

import { nameSessionDeviceUseCase } from "../auth/name-session-device.usecase"

/**
 * Registers this device, then names it on the session with its root key's proof: setting the
 * history key, approving a device and reporting a generation all take a session that named its
 * device (`identity-provider/specs/e2ee.md § 6.1`). `device_mismatch` is thrown: the session is
 * another device's.
 */
export function setUpThisDeviceUseCase(deps: { e2eePort: IE2eePort; sessionPort: ISessionPort }) {
    return async (idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<void> => {
        await deps.e2eePort.registerDevice(idpUrl, accessToken, actorUri)
        await nameSessionDeviceUseCase(deps)(idpUrl, accessToken, actorUri)
    }
}
