import { ScrollView, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { useMlsCheckViewModel } from "./mls-check.viewmodel"

/** Development builds only: the MLS engine's contract, played on the native build. */
export function MlsCheckPage() {
    const insets = useSafeAreaInsets()
    const { results, running, passed, total, runAgain } = useMlsCheckViewModel()
    const failed = results.length - passed

    return (
        <View style={styles.screen(insets.top, insets.bottom)}>
            <Text
                accessibilityRole="header"
                style={styles.title}
            >
                MLS engine
            </Text>
            <Text
                accessibilityLiveRegion="polite"
                style={styles.summary}
            >
                {running ? `Playing the contract… ${results.length}/${total}` : `${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ""}`}
            </Text>
            <ScrollView contentContainerStyle={styles.list}>
                {results.map((result) => (
                    <View
                        key={result.name}
                        style={styles.row}
                    >
                        <Text style={styles.mark(result.error === null)}>{result.error === null ? "✓" : "✗"}</Text>
                        <View style={styles.rowBody}>
                            <Text style={styles.name}>{result.name}</Text>
                            {result.error !== null ? <Text style={styles.error}>{result.error}</Text> : null}
                        </View>
                        <Text style={styles.ms}>{Math.round(result.ms)} ms</Text>
                    </View>
                ))}
            </ScrollView>
            <Button
                label={running ? "Playing…" : "Run again"}
                disabled={running}
                onPress={runAgain}
            />
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
    list: {
        gap: 10,
        paddingBottom: 8,
    },
    row: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
    },
    mark: (passed: boolean) => ({
        width: 16,
        fontFamily: "DM Sans",
        fontSize: 15,
        lineHeight: 21,
        color: passed ? theme.colors.onlineInk : theme.colors.destructive,
    }),
    rowBody: {
        flex: 1,
        gap: 2,
    },
    name: {
        fontFamily: "DM Sans",
        fontSize: 15,
        lineHeight: 21,
        color: theme.colors.foreground,
    },
    error: {
        fontFamily: "Azeret Mono",
        fontSize: 12,
        lineHeight: 17,
        color: theme.colors.destructive,
    },
    ms: {
        fontFamily: "Azeret Mono",
        fontSize: 12,
        lineHeight: 21,
        color: theme.colors.mutedForeground,
    },
}))
