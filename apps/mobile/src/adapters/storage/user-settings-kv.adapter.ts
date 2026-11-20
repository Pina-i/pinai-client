import type { AccountSettings, AccountSettingsSection, DeviceSettings } from "@pinai/domain/models/user-settings"
import type { IUserSettingsStorePort } from "@pinai/domain/ports/user-settings.port"
import type { SyncKeyValue } from "./kv-storage"

const DEVICE_KEY = "pinai.settings.device"
const ACCOUNT_KEY = "pinai.settings.account"
/** Bumped when a stored shape changes; the web's shapes, the same version. */
const VERSION = 1

/** {@link IUserSettingsStorePort} in the kv-store: this phone's settings, and its copy of the account's. */
export class UserSettingsKvAdapter implements IUserSettingsStorePort {
    private readonly kv: SyncKeyValue

    constructor(kv: SyncKeyValue) {
        this.kv = kv
    }

    readDevice(): unknown {
        return this.read(DEVICE_KEY)
    }

    writeDevice(settings: DeviceSettings): void {
        this.write(DEVICE_KEY, settings)
    }

    readAccount(): unknown {
        return this.read(ACCOUNT_KEY)
    }

    writeAccount(settings: AccountSettings, meta: { unsynced: AccountSettingsSection[]; owner: string | null }): void {
        this.write(ACCOUNT_KEY, { ...settings, ...meta })
    }

    private read(key: string): unknown {
        try {
            const stored = this.kv.getItemSync(key)
            return stored ? JSON.parse(stored) : null
        } catch {
            return null
        }
    }

    private write(key: string, value: object): void {
        try {
            this.kv.setItemSync(key, JSON.stringify({ version: VERSION, ...value }))
        } catch {
            // The kv-store refused: the setting lasts until the app closes.
        }
    }
}
