import type { DeviceListResponse } from "../models/device"

/**
 * Device-directory CRUD, separate from the crypto-focused `IE2eePort`.
 * Revoking a device is `revokeDeviceUseCase`: `markRevoked`, then the MLS
 * Remove commits.
 */
export interface IDeviceDirectoryPort {
    listDevices(idpUrl: string, accessToken: string): Promise<DeviceListResponse>
    markRevoked(idpUrl: string, accessToken: string, deviceId: string): Promise<void>
}
