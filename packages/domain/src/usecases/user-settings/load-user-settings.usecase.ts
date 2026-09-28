import {
    parseAccountSettingsCopy,
    parseDeviceSettings,
    type AccountSettingsCopy,
    type DeviceSettings,
} from "../../models/user-settings"
import type { IUserSettingsStorePort } from "../../ports/user-settings.port"

/** The settings this device holds, with defaults for anything missing or unknown. */
export function loadUserSettingsUseCase(store: IUserSettingsStorePort): {
    account: AccountSettingsCopy
    device: DeviceSettings
} {
    return {
        account: parseAccountSettingsCopy(store.readAccount()),
        device: parseDeviceSettings(store.readDevice()),
    }
}
