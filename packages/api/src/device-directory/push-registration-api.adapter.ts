import { idp } from "../http"
import { idpErrorFrom } from "../idp-error"

import type { IPushRegistrationPort, PushRegistration } from "@pinai/domain/ports/push-registration.port"

/** `PUT` / `DELETE /api/keys/devices/{device_id}/push`. */
export class PushRegistrationApiAdapter implements IPushRegistrationPort {
    async register(idpUrl: string, accessToken: string, deviceId: string, registration: PushRegistration): Promise<void> {
        try {
            await idp.put(pushUrl(idpUrl, deviceId), {
                headers: { Authorization: `Bearer ${accessToken}` },
                json: { relay: registration.relay, token: registration.token },
            })
        } catch (error) {
            throw await idpErrorFrom(error, "Registering for push notices failed")
        }
    }

    async unregister(idpUrl: string, accessToken: string, deviceId: string): Promise<void> {
        try {
            await idp.delete(pushUrl(idpUrl, deviceId), {
                headers: { Authorization: `Bearer ${accessToken}` },
            })
        } catch (error) {
            throw await idpErrorFrom(error, "Unregistering from push notices failed")
        }
    }
}

function pushUrl(idpUrl: string, deviceId: string): string {
    return `${idpUrl.replace(/\/$/, "")}/api/keys/devices/${encodeURIComponent(deviceId)}/push`
}
