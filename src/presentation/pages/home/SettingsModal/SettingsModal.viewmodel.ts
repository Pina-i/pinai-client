import { useState } from "react"

export type SettingsSection =
    | "profile"
    | "privacy"
    | "appearance"
    | "notifications"
    | "voice"
    | "keybinds"
    | "devices"
    | "connections"

export interface SettingsModalViewModel {
    activeSection: SettingsSection
    selectSection: (section: SettingsSection) => void
}

export function useSettingsModalViewModel(): SettingsModalViewModel {
    const [activeSection, setActiveSection] = useState<SettingsSection>("profile")
    return { activeSection, selectSection: setActiveSection }
}
