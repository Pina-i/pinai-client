import { DEFAULT_ACCOUNT_SETTINGS, parseAccountSettings } from "@pinai/domain/models/user-settings"
import { loadUserSettingsUseCase } from "@pinai/domain/usecases/user-settings/load-user-settings.usecase"
import { describe, expect, it } from "vitest"
import type { SyncKeyValue } from "../src/adapters/storage/kv-storage"
import { UserSettingsKvAdapter } from "../src/adapters/storage/user-settings-kv.adapter"

function kv(): SyncKeyValue {
    const items = new Map<string, string>()
    return {
        getItemSync: (key) => items.get(key) ?? null,
        setItemSync: (key, value) => void items.set(key, value),
        removeItemSync: (key) => items.delete(key),
    }
}

describe("UserSettingsKvAdapter", () => {
    it("starts with the domain's defaults and no owner", () => {
        const { account, device } = loadUserSettingsUseCase(new UserSettingsKvAdapter(kv()))

        expect(account).toEqual({ settings: DEFAULT_ACCOUNT_SETTINGS, unsynced: [], owner: null })
        expect(device).toEqual({ mode: "system" })
    })

    it("keeps the account's copy as the domain reads it back, for the next launch", () => {
        const store = kv()
        const settings = parseAccountSettings({ appearance: { family: "lagoon", motif: "raranga" } })
        new UserSettingsKvAdapter(store).writeAccount(settings, { unsynced: [], owner: "https://idp.test/users/hoku_ab12c" })

        expect(loadUserSettingsUseCase(new UserSettingsKvAdapter(store)).account).toEqual({
            settings,
            unsynced: [],
            owner: "https://idp.test/users/hoku_ab12c",
        })
    })
})
