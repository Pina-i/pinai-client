import { Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet } from "react-native-unistyles"
import { useStorageRestartViewModel } from "./storage-restart.viewmodel"

/** Development builds only: the encrypted store across the app being killed, driven by `storage:check`. */
export function StorageRestartPage() {
    const insets = useSafeAreaInsets()
    const { phase, outcome } = useStorageRestartViewModel()

    return (
        <View style={styles.screen(insets.top, insets.bottom)}>
            <Text
                accessibilityRole="header"
                style={styles.title}
            >
                Across a restart
            </Text>
            <Text
                accessibilityLiveRegion="polite"
                style={styles.summary}
            >
                {phase === null
                    ? "Open with ?phase=write, then ?phase=read once the app was killed and started again."
                    : `${phase}: ${outcome ?? "…"}`}
            </Text>
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    screen: (top: number, bottom: number) => ({
        flex: 1,
        gap: 12,
        paddingTop: top + 16,
        paddingBottom: Math.max(bottom, 16) + 8,
        paddingHorizontal: 20,
        backgroundColor: theme.colors.background,
    }),
    title: {
        fontFamily: "Instrument Serif",
        fontSize: 32,
        letterSpacing: -0.48,
        color: theme.colors.foreground,
    },
    summary: {
        fontFamily: "Azeret Mono",
        fontSize: 13,
        color: theme.colors.mutedForeground,
    },
}))
