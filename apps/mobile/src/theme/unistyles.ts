import { resolveMode, themeId, type ThemeId } from "@pinai/domain/models/user-settings"
import { Appearance } from "react-native"
import { StyleSheet, UnistylesRuntime } from "react-native-unistyles"
import { useAppStore } from "@/store/store"
import { layout, radius, space, themes, type } from "./themes.generated"

type Colors = Record<keyof (typeof themes)["pearl-dark"]["colors"], string>

/** A radial gradient of the ambient wash: radii in dp, centre in % of the screen, `stop` where it fades out. */
export interface AmbientGradient {
    color: string
    opacity: number
    rx: number
    ry: number
    cx: number
    cy: number
    stop: number
}

function theme(id: ThemeId) {
    const { colors, grain, motifOpacity, ambient } = themes[id]
    return {
        colors: colors as Colors,
        grain: grain as { opacity: number; blend: "overlay" | "multiply" },
        motifOpacity: motifOpacity as number,
        ambient: ambient as readonly AmbientGradient[],
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
    const { appearance, deviceMode } = useAppStore.getState()
    return themeId(appearance.family, resolveMode(deviceMode, Appearance.getColorScheme() !== "light"))
}

StyleSheet.configure({
    themes: appThemes,
    breakpoints,
    settings: { initialTheme: currentTheme },
})

Appearance.addChangeListener(() => UnistylesRuntime.setTheme(currentTheme()))
useAppStore.subscribe((state, previous) => {
    if (state.appearance.family !== previous.appearance.family || state.deviceMode !== previous.deviceMode) {
        UnistylesRuntime.setTheme(currentTheme())
    }
})
