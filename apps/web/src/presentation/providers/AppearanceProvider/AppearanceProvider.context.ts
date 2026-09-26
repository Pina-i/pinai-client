import { createContext, useContext } from "react"
import {
    DEFAULT_ACCOUNT_SETTINGS,
    type AppearanceSettings,
    type ModePreference,
    type ThemeMode,
} from "@pinai/domain/models/user-settings"

export interface AppearanceContextValue {
    /** Palette and motif — account settings. */
    appearance: AppearanceSettings
    /** Dark, light or system, as chosen on this device. */
    modePreference: ModePreference
    /** The mode actually painted: the preference, with `system` resolved against the OS. */
    mode: ThemeMode
    /** Change the palette or motif. Saved, applied with a cross-fade. */
    setAppearance: (change: Partial<AppearanceSettings>) => void
    /** Change this device's mode. Saved on the device only, applied with a cross-fade. */
    setModePreference: (preference: ModePreference) => void
    /** Account settings another session saved (`settings_updated`), raw. */
    receiveAccountSettings: (remote: unknown) => void
}

export const AppearanceContext = createContext<AppearanceContextValue>({
    appearance: DEFAULT_ACCOUNT_SETTINGS.appearance,
    modePreference: "system",
    mode: "dark",
    setAppearance: () => {},
    setModePreference: () => {},
    receiveAccountSettings: () => {},
})

export function useAppearance(): AppearanceContextValue {
    return useContext(AppearanceContext)
}
