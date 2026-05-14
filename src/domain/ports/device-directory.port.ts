import type { DeviceListResponse } from "@/domain/models/device"

/**
 * Phase 6b — directory of the user's devices, separate from the
 * crypto-focused `IE2eePort`. Two operations:
 *
 *   - `listDevices`  →  `GET  /api/keys/devices`  (Bearer)
 *   - `markRevoked`  →  `POST /api/keys/devices/:device_id/revoke` (Bearer)
 *
 * Revocation is a two-step orchestration in the viewmodel: first the
 * MLS Remove commits are issued via `IE2eePort.revokeDevice`, then
 * this server endpoint records the directory-level revocation flag.
 * The split keeps crypto operations on the e2ee port.
 */
export interface IDeviceDirectoryPort {
    listDevices(idpUrl: string, accessToken: string): Promise<DeviceListResponse>
    markRevoked(idpUrl: string, accessToken: string, deviceId: string): Promise<void>
}
