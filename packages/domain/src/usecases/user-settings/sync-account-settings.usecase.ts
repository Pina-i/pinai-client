import { hasUnsyncedChange, parseAccountSettings, parseAccountSettingsCopy, type AccountSettings } from "../../models/user-settings"
import type { IAccountSettingsPort, IUserSettingsStorePort } from "../../ports/user-settings.port"
import { pushAccountSettingsUseCase } from "./push-account-settings.usecase"

/**
 * On sign-in: settle which copy of `account`'s settings wins. A change this
 * device made and couldn't send is newer than the IdP's copy, so it is sent
 * now; otherwise the IdP's copy — `remote`, as `/userinfo` delivered it —
 * replaces the local one. A copy left by another account never counts.
 */
export async function syncAccountSettingsOnSignInUseCase(
    idpUrl: string,
    accessToken: string,
    remote: unknown,
    account: string,
    api: IAccountSettingsPort,
    store: IUserSettingsStorePort,
): Promise<AccountSettings> {
    const copy = parseAccountSettingsCopy(store.readAccount())
    if (hasUnsyncedChange(copy, account)) {
        return pushAccountSettingsUseCase(idpUrl, accessToken, copy.settings, account, api, store)
    }
    const settings = parseAccountSettings(remote)
    store.writeAccount(settings, { unsynced: [], owner: account })
    return settings
}

/**
 * Another session of `account` changed its settings (`settings_updated`).
 * Adopted unless this device holds a newer change of its own, which its own
 * push will settle — adopting would flash the older value back first.
 * Returns the settings to paint, or `null` to keep the current ones.
 */
export function receiveAccountSettingsUseCase(
    remote: unknown,
    account: string,
    store: IUserSettingsStorePort,
): AccountSettings | null {
    if (hasUnsyncedChange(parseAccountSettingsCopy(store.readAccount()), account)) return null
    const settings = parseAccountSettings(remote)
    store.writeAccount(settings, { unsynced: [], owner: account })
    return settings
}
