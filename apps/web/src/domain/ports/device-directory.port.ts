import type { DeviceListResponse } from "@/domain/models/device"

/**
 * Device-directory CRUD, separate from the crypto-focused `IE2eePort`.
 * Revoke is a two-step orchestration in the viewmodel — MLS Remove
 * commits via `IE2eePort.revokeDevice`, then `markRevoked` to flip the
 * directory flag.
 */
export interface IDeviceDirectoryPort {
    listDevices(idpUrl: string, accessToken: string): Promise<DeviceListResponse>
    markRevoked(idpUrl: string, accessToken: string, deviceId: string): Promise<void>
}
