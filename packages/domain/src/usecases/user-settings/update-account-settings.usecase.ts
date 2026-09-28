import { mergeAccountSettings, type AccountSettings, type AccountSettingsChange } from "../../models/user-settings"
import type { IUserSettingsStorePort } from "../../ports/user-settings.port"

/**
 * Apply a change to `account`'s settings on this device: it is kept at once,
 * marked unsynced until `pushAccountSettingsUseCase` gets it to the IdP.
 */
export function updateAccountSettingsUseCase(
    current: AccountSettings,
    change: AccountSettingsChange,
    account: string,
    store: IUserSettingsStorePort,
): AccountSettings {
    const next = mergeAccountSettings(current, change)
    store.writeAccount(next, { synced: false, owner: account })
    return next
}
