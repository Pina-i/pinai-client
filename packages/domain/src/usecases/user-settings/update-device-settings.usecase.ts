import type { DeviceSettings } from "../../models/user-settings"
import type { IUserSettingsStorePort } from "../../ports/user-settings.port"

export function updateDeviceSettingsUseCase(settings: DeviceSettings, store: IUserSettingsStorePort): DeviceSettings {
    store.writeDevice(settings)
    return settings
}
