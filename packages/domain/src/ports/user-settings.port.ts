import type { AccountSettings, AccountSettingsSection, DeviceSettings } from "../models/user-settings"

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
    writeAccount(settings: AccountSettings, meta: { unsynced: AccountSettingsSection[]; owner: string | null }): void
}

/**
 * The account's own copy of its settings, on the IdP. Read on sign-in from
 * `UserProfile.settings`; this port only writes. `update` sends whole
 * sections — each replaces the IdP's, the others are kept — and resolves to
 * the merged document, raw.
 */
export interface IAccountSettingsPort {
    update(idpUrl: string, accessToken: string, sections: Partial<AccountSettings>): Promise<unknown>
}
