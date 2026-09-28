import {
    changedSections,
    mergeAccountSettings,
    parseAccountSettingsCopy,
    type AccountSettings,
    type AccountSettingsChange,
} from "../../models/user-settings"
import type { IUserSettingsStorePort } from "../../ports/user-settings.port"

/**
 * Apply a change to `account`'s settings on this device: it is kept at once,
 * its sections marked unsynced — with any still waiting from an earlier
 * change — until `pushAccountSettingsUseCase` gets them to the IdP.
 */
export function updateAccountSettingsUseCase(
    current: AccountSettings,
    change: AccountSettingsChange,
    account: string,
    store: IUserSettingsStorePort,
): AccountSettings {
    const next = mergeAccountSettings(current, change)
    const copy = parseAccountSettingsCopy(store.readAccount())
    const waiting = copy.owner === account ? copy.unsynced : []
    const unsynced = [...new Set([...waiting, ...changedSections(change)])]
    store.writeAccount(next, { unsynced, owner: account })
    return next
}
