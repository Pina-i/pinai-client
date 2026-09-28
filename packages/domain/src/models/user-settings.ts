/**
 * The user's settings, in two scopes:
 *
 * - `AccountSettings` follow the account to every device (palette, motif,
 *   notification mutes).
 * - `DeviceSettings` stay on the device they were chosen on (light or dark:
 *   that depends on the screen and the room, not on who is signed in).
 *
 * Each section is validated on its own, so a stored value that a later
 * release no longer understands falls back without taking the rest with it.
 */

export const THEME_FAMILIES = ["pearl", "lagoon", "jungle", "sand"] as const
export type ThemeFamily = (typeof THEME_FAMILIES)[number]

export const MOTIFS = ["kowhaiwhai", "raranga", "puhoro", "tapa1", "tapa2", "tapa3", "tapa4"] as const
export type MotifKey = (typeof MOTIFS)[number]

/** The mode a theme is actually painted in. */
export const THEME_MODES = ["dark", "light"] as const
export type ThemeMode = (typeof THEME_MODES)[number]

/** The mode chosen on a device; `system` follows the OS. */
export const MODE_PREFERENCES = ["system", "dark", "light"] as const
export type ModePreference = (typeof MODE_PREFERENCES)[number]

/** `family-mode` — each palette re-specifies its light values, so a theme is the pair. */
export type ThemeId = `${ThemeFamily}-${ThemeMode}`

export interface AppearanceSettings {
    family: ThemeFamily
    motif: MotifKey
}

export interface NotificationSettings {
    muteAll: boolean
    /** Conversation ids. */
    mutedConversations: string[]
}

export interface AccountSettings {
    appearance: AppearanceSettings
    notifications: NotificationSettings
}

export type AccountSettingsSection = keyof AccountSettings

const ACCOUNT_SETTINGS_SECTIONS: readonly AccountSettingsSection[] = ["appearance", "notifications"]

export interface DeviceSettings {
    mode: ModePreference
}

/** A change to the account settings: any section, any subset of its fields. */
export interface AccountSettingsChange {
    appearance?: Partial<AppearanceSettings>
    notifications?: Partial<NotificationSettings>
}

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
    appearance: { family: "pearl", motif: "kowhaiwhai" },
    notifications: { muteAll: false, mutedConversations: [] },
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = { mode: "system" }

export function themeId(family: ThemeFamily, mode: ThemeMode): ThemeId {
    return `${family}-${mode}`
}

export function resolveMode(preference: ModePreference, systemPrefersDark: boolean): ThemeMode {
    if (preference !== "system") return preference
    return systemPrefersDark ? "dark" : "light"
}

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
    return typeof value === "string" && (values as readonly string[]).includes(value)
}

function record(raw: unknown): Record<string, unknown> {
    return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
}

export function parseAccountSettings(raw: unknown): AccountSettings {
    const appearance = record(record(raw).appearance)
    const notifications = record(record(raw).notifications)
    const muted = Array.isArray(notifications.mutedConversations) ? notifications.mutedConversations : []
    const fallback = DEFAULT_ACCOUNT_SETTINGS.appearance
    return {
        appearance: {
            family: oneOf(THEME_FAMILIES, appearance.family) ? appearance.family : fallback.family,
            motif: oneOf(MOTIFS, appearance.motif) ? appearance.motif : fallback.motif,
        },
        notifications: {
            muteAll: notifications.muteAll === true,
            mutedConversations: muted.filter((id): id is string => typeof id === "string"),
        },
    }
}

export function parseDeviceSettings(raw: unknown): DeviceSettings {
    const mode = record(raw).mode
    return { mode: oneOf(MODE_PREFERENCES, mode) ? mode : DEFAULT_DEVICE_SETTINGS.mode }
}

/** Apply a change section by section; fields the change leaves out keep their value. */
export function mergeAccountSettings(current: AccountSettings, change: AccountSettingsChange): AccountSettings {
    return {
        appearance: { ...current.appearance, ...change.appearance },
        notifications: { ...current.notifications, ...change.notifications },
    }
}

/** The sections a change names, in the document's order. */
export function changedSections(change: AccountSettingsChange): AccountSettingsSection[] {
    return ACCOUNT_SETTINGS_SECTIONS.filter((section) => change[section] !== undefined)
}

/** Only the named sections: the IdP replaces each section it is sent, so the others must not go out stale. */
export function pickSections(settings: AccountSettings, sections: AccountSettingsSection[]): Partial<AccountSettings> {
    return Object.fromEntries(sections.map((section) => [section, settings[section]]))
}

/**
 * This device's copy of the account settings: what it paints before the
 * account's own copy is known, and a change it could not send yet.
 */
export interface AccountSettingsCopy {
    settings: AccountSettings
    /** Sections changed here that haven't reached the IdP. */
    unsynced: AccountSettingsSection[]
    /** Actor URI of the account these settings belong to; `null` before any sign-in. */
    owner: string | null
}

export function parseAccountSettingsCopy(raw: unknown): AccountSettingsCopy {
    const stored = record(raw)
    // A copy from before sections were tracked could only hold an unsynced appearance.
    const legacy = stored.synced === false ? ["appearance"] : []
    const unsynced = Array.isArray(stored.unsynced) ? stored.unsynced : legacy
    return {
        settings: parseAccountSettings(raw),
        unsynced: ACCOUNT_SETTINGS_SECTIONS.filter((section) => unsynced.includes(section)),
        owner: typeof stored.owner === "string" ? stored.owner : null,
    }
}

/** Parsed settings are built field by field in a fixed order, so equal settings serialise equally. */
export function sameAccountSettings(a: AccountSettings, b: AccountSettings): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
}

/** Whether this device holds a change for `account` that the IdP hasn't received. */
export function hasUnsyncedChange(copy: AccountSettingsCopy, account: string): boolean {
    return copy.owner === account && copy.unsynced.length > 0
}
