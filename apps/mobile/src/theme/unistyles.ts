import { DEFAULT_ACCOUNT_SETTINGS, DEFAULT_DEVICE_SETTINGS, resolveMode, themeId, type ThemeId } from "@pinai/domain/models/user-settings"
import { Appearance } from "react-native"
import { StyleSheet, UnistylesRuntime } from "react-native-unistyles"
import { layout, radius, space, themes, type } from "./themes.generated"

type Colors = Record<keyof (typeof themes)["pearl-dark"]["colors"], string>

function theme(id: ThemeId) {
    const { colors, grain, motifOpacity } = themes[id]
    return {
        colors: colors as Colors,
        grain: grain as { opacity: number; blend: "overlay" | "multiply" },
        motifOpacity: motifOpacity as number,
        type,
        radius,
        space,
        layout,
    }
}

export type AppTheme = ReturnType<typeof theme>
type AppThemes = Record<ThemeId, AppTheme>

const appThemes = Object.fromEntries(Object.keys(themes).map((id) => [id, theme(id as ThemeId)])) as AppThemes

const breakpoints = { xs: 0, sm: 380, md: 600, lg: 900 }

declare module "react-native-unistyles" {
    export interface UnistylesThemes extends AppThemes {}
    export interface UnistylesBreakpoints extends Readonly<typeof breakpoints> {}
}

function currentTheme(): ThemeId {
    const dark = Appearance.getColorScheme() !== "light"
    return themeId(DEFAULT_ACCOUNT_SETTINGS.appearance.family, resolveMode(DEFAULT_DEVICE_SETTINGS.mode, dark))
}

StyleSheet.configure({
    themes: appThemes,
    breakpoints,
    settings: { initialTheme: currentTheme },
})

Appearance.addChangeListener(() => UnistylesRuntime.setTheme(currentTheme()))
