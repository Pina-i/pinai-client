import { sessionIdOf } from "../../models/auth"
import type { ActorUri } from "../../models/e2ee"
import { IdpError, isDeviceProofInvalid } from "../../models/idp-error"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { ISessionPort } from "../../ports/session.port"

/**
 * Names this device on the session with its proof: the root key's signature over the session the
 * access token belongs to (`identity-provider/specs/auth.md § 1`, "Sessions and devices"). A proof
 * the IdP refuses — no root key registered for the device there, or another — registers the device
 * again and names it once more; a second refusal is thrown, never tried again here.
 */
export function nameSessionDeviceUseCase(deps: { e2eePort: IE2eePort; sessionPort: ISessionPort }) {
    return async (idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<void> => {
        const sessionId = sessionIdOf(accessToken)
        if (!sessionId) throw new Error("The access token names no session to name this device on")
        const name = async () => {
            const deviceId = await deps.e2eePort.getDeviceId()
            const signature = await deps.e2eePort.signSessionDevice(actorUri, deviceId, sessionId)
            await deps.sessionPort.linkDevice(idpUrl, accessToken, deviceId, signature)
        }
        try {
            await name()
        } catch (error) {
            if (!isDeviceProofInvalid(error)) throw error
            await deps.e2eePort.registerDevice(idpUrl, accessToken, actorUri, { again: true })
            try {
                await name()
            } catch (again) {
                // Shown as it is by the pages that set the device up: the IdP's words name keys.
                if (again instanceof IdpError && isDeviceProofInvalid(again)) {
                    throw new IdpError(again.status, again.code, "Your instance didn't recognise this device, so it can't be set up here.")
                }
                throw again
            }
        }
    }
}
