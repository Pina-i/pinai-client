import type { DeviceListResponse } from "../models/device"

/**
 * Device-directory CRUD, separate from the crypto-focused `IE2eePort`.
 * Revoking a device is `revokeDeviceUseCase`: `markRevoked`, then the MLS
 * Remove commits.
 */
export interface IDeviceDirectoryPort {
    listDevices(idpUrl: string, accessToken: string): Promise<DeviceListResponse>
    markRevoked(idpUrl: string, accessToken: string, deviceId: string): Promise<void>
    /**
     * The session's own device approved by the passphrase: `signature` is the generation's
     * approval key's. `IdpError` 409 `stale_history_key` under another generation.
     */
    approveByPassphrase(
        idpUrl: string,
        accessToken: string,
        deviceId: string,
        generation: number,
        signature: Uint8Array,
    ): Promise<void>
    /**
     * The session's device approves `deviceId`, another device of the account: `signature` is its
     * root key's over `PINAI-DEVICE-APPROVAL-v1` for `deviceId`'s root key as the IdP holds it.
     */
    approveByDevice(idpUrl: string, accessToken: string, deviceId: string, signature: Uint8Array): Promise<void>
    /** The device says it holds `generation`, from its own session. */
    reportHistoryKey(idpUrl: string, accessToken: string, deviceId: string, generation: number): Promise<void>
}
