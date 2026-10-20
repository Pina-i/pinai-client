import { HTTPError } from "ky"
import { idp } from "../http"

import type { DeviceListResponse } from "@pinai/domain/models/device"
import type { IDeviceDirectoryPort } from "@pinai/domain/ports/device-directory.port"

/** REST client for the device-directory endpoints. */
export class DeviceDirectoryApiAdapter implements IDeviceDirectoryPort {
    async listDevices(idpUrl: string, accessToken: string): Promise<DeviceListResponse> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/keys/devices`
        try {
            return await idp
                .get(url, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                })
                .json<DeviceListResponse>()
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = (await error.response.json().catch(() => ({}))) as { error?: string }
                throw new Error(
                    err.error ?? `Failed to fetch devices: ${error.response.status}`,
                )
            }
            throw error
        }
    }

    async markRevoked(
        idpUrl: string,
        accessToken: string,
        deviceId: string,
    ): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/keys/devices/${encodeURIComponent(
            deviceId,
        )}/revoke`
        try {
            await idp.post(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            })
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = (await error.response.json().catch(() => ({}))) as { error?: string }
                throw new Error(
                    err.error ?? `Failed to revoke device: ${error.response.status}`,
                )
            }
            throw error
        }
    }
}
