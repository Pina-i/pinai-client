import { parseAccountSettings, parseAccountSettingsCopy, sameAccountSettings, type AccountSettings } from "../../models/user-settings"
import type { IAccountSettingsPort, IUserSettingsStorePort } from "../../ports/user-settings.port"

/**
 * Send `account`'s settings to the IdP. The local copy is marked synced only
 * if it still holds what was sent: a change made while the request was in
 * flight stays unsynced, and goes out with its own push.
 *
 * Throws when the IdP can't be reached; the copy then stays unsynced and is
 * sent again on the next sign-in.
 */
export async function pushAccountSettingsUseCase(
    idpUrl: string,
    accessToken: string,
    settings: AccountSettings,
    account: string,
    api: IAccountSettingsPort,
    store: IUserSettingsStorePort,
): Promise<AccountSettings> {
    const saved = parseAccountSettings(await api.update(idpUrl, accessToken, settings))
    const copy = parseAccountSettingsCopy(store.readAccount())
    if (copy.owner === account && sameAccountSettings(copy.settings, settings)) {
        store.writeAccount(saved, { synced: true, owner: account })
    }
    return saved
}
