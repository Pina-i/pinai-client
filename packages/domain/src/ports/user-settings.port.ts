import type { AccountSettings, DeviceSettings } from "../models/user-settings"

/**
 * Where the user's settings are kept on this device.
 *
 * - `readDevice` / `writeDevice`: settings that belong to this device only.
 * - `readAccount` / `writeAccount`: this device's copy of the account
 *   settings (see `AccountSettingsCopy`): what the app paints before the
 *   account's own copy is known, and a change not yet sent to the IdP.
 *
 * Reads return whatever was stored, unvalidated: `parseAccountSettingsCopy`
 * and `parseDeviceSettings` own what counts as valid.
 */
export interface IUserSettingsStorePort {
    readDevice(): unknown
    writeDevice(settings: DeviceSettings): void
    readAccount(): unknown
    writeAccount(settings: AccountSettings, meta: { synced: boolean; owner: string | null }): void
}

/**
 * The account's own copy of its settings, on the IdP. Read on sign-in from
 * `UserProfile.settings`; this port only writes. `update` sends whole
 * sections and resolves to the merged document, raw.
 */
export interface IAccountSettingsPort {
    update(idpUrl: string, accessToken: string, settings: AccountSettings): Promise<unknown>
}
