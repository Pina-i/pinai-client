import type { UserProfile } from "@pinai/domain/models/auth"
import type { UserStatus } from "@pinai/domain/models/presence"
import type { AccountSettings, AppearanceSettings, ModePreference, NotificationSettings } from "@pinai/domain/models/user-settings"
import { loadUserSettingsUseCase } from "@pinai/domain/usecases/user-settings/load-user-settings.usecase"
import Storage from "expo-sqlite/kv-store"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { UserSettingsKvAdapter } from "@/adapters/storage/user-settings-kv.adapter"

interface AuthSlice {
    /** In memory only: a restart renews it from the keychain's refresh token. */
    accessToken: string | null
    user: UserProfile | null
    /** The instance signed in to, kept so a restart knows where to resume. */
    idpUrl: string | null
    setSession: (accessToken: string, user: UserProfile, idpUrl: string) => void
    clearSession: () => void
}

interface PresenceSlice {
    /** The status the user chose, `online` at each launch as on the web. */
    myStatus: UserStatus
    setMyStatus: (status: UserStatus) => void
}

interface AccountSettingsSlice {
    /** The account's palette and motif, as this phone's copy holds them. */
    appearance: AppearanceSettings
    /** The account's mutes, as this phone's copy holds them: the list shows a muted conversation. */
    notifications: NotificationSettings
    /** Dark or light: this phone's, `system` following it. */
    deviceMode: ModePreference
    setAccountSettings: (settings: AccountSettings) => void
}

// The kv-store's synchronous half: the instance and the palette are known before the first render.
const storage = createJSONStorage(() => ({
    getItem: (name: string) => Storage.getItemSync(name),
    setItem: (name: string, value: string) => Storage.setItemSync(name, value),
    removeItem: (name: string) => void Storage.removeItemSync(name),
}))

const kept = loadUserSettingsUseCase(new UserSettingsKvAdapter(Storage))

export const useAppStore = create<AuthSlice & PresenceSlice & AccountSettingsSlice>()(
    persist(
        (set) => ({
            accessToken: null,
            user: null,
            idpUrl: null,
            setSession: (accessToken, user, idpUrl) => set({ accessToken, user, idpUrl }),
            clearSession: () => set({ accessToken: null, user: null, idpUrl: null, myStatus: "online" }),
            myStatus: "online",
            setMyStatus: (myStatus) => set({ myStatus }),
            appearance: kept.account.settings.appearance,
            notifications: kept.account.settings.notifications,
            deviceMode: kept.device.mode,
            setAccountSettings: ({ appearance, notifications }) => set({ appearance, notifications }),
        }),
        { name: "pinai.session", storage, partialize: (state) => ({ idpUrl: state.idpUrl }) }
    )
)
