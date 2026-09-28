/**
 * The user's settings as this device keeps them, in `localStorage`: the
 * device's own settings, and its copy of the account's. `index.html` reads
 * both keys before anything paints — keep it in step with the keys and shapes.
 */

import type { AccountSettings, DeviceSettings } from "@pinai/domain/models/user-settings"
import type { IUserSettingsStorePort } from "@pinai/domain/ports/user-settings.port"

export const DEVICE_SETTINGS_KEY = "pinai.settings.device"
export const ACCOUNT_SETTINGS_KEY = "pinai.settings.account"

/** Bumped when a stored shape changes, so a reader can tell which one it holds. */
const VERSION = 1

/** Where next-themes kept the light/dark choice before settings existed. */
const LEGACY_THEME_KEY = "theme"

function read(key: string): unknown {
    try {
        const stored = localStorage.getItem(key)
        return stored ? JSON.parse(stored) : null
    } catch {
        // Blocked storage, or a value that isn't JSON: the caller falls back to the default.
        return null
    }
}

function write(key: string, value: object): void {
    try {
        localStorage.setItem(key, JSON.stringify({ version: VERSION, ...value }))
    } catch {
        // Storage unavailable (private mode, quota): the setting lasts this session only.
    }
}

export class UserSettingsLocalStorageAdapter implements IUserSettingsStorePort {
    readDevice(): unknown {
        const stored = read(DEVICE_SETTINGS_KEY)
        if (stored) return stored
        try {
            const legacy = localStorage.getItem(LEGACY_THEME_KEY)
            return legacy === "light" || legacy === "dark" ? { mode: legacy } : null
        } catch {
            return null
        }
    }

    writeDevice(settings: DeviceSettings): void {
        write(DEVICE_SETTINGS_KEY, settings)
        try {
            localStorage.removeItem(LEGACY_THEME_KEY)
        } catch {
            // Nothing to clean up without storage.
        }
    }

    readAccount(): unknown {
        return read(ACCOUNT_SETTINGS_KEY)
    }

    writeAccount(settings: AccountSettings, meta: { synced: boolean; owner: string | null }): void {
        write(ACCOUNT_SETTINGS_KEY, { ...settings, ...meta })
    }
}
