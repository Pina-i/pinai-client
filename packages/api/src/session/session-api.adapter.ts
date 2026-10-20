import type { ISessionPort } from "@pinai/domain/ports/session.port"

import { idp } from "../http"
import { idpErrorFrom } from "../idp-error"

export class SessionApiAdapter implements ISessionPort {
    async linkDevice(idpUrl: string, accessToken: string, deviceId: string): Promise<void> {
        try {
            await idp.put(`${idpUrl.replace(/\/$/, "")}/api/sessions/current/device`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json: { device_id: deviceId },
            })
        } catch (error) {
            throw await idpErrorFrom(error, "Linking this device failed")
        }
    }

    async signOutOtherDevices(idpUrl: string, accessToken: string): Promise<void> {
        try {
            await idp.delete(`${idpUrl.replace(/\/$/, "")}/api/sessions?keep=current`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            })
        } catch (error) {
            throw await idpErrorFrom(error, "Signing out the other devices failed")
        }
    }
}
