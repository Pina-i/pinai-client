import { TriangleAlert } from "lucide-react-native"
import { Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { tint } from "@/theme/tint"
import { useHistoryResetBanner } from "./history-reset-banner.viewmodel"

/** Over the app while this device is in by its kept words: it can't be dismissed, only settled. */
export function HistoryResetBanner() {
    const vm = useHistoryResetBanner()
    const { theme } = useUnistyles()
    if (!vm.cause || !vm.text) return null

    return (
        <View
            accessibilityRole="alert"
            style={styles.banner}
        >
            <View style={styles.line}>
                <TriangleAlert
                    size={16}
                    color={theme.colors.idleInk}
                    strokeWidth={1.9}
                />
                <Text style={styles.text}>{vm.text}</Text>
            </View>
            {vm.found && (
                <Text
                    accessibilityLiveRegion="polite"
                    style={styles.found}
                >
                    {vm.found}
                </Text>
            )}
            <View style={styles.actions}>
                {vm.cause === "reset-by-unapproved" ? (
                    <>
                        <View style={styles.action}>
                            <Button
                                label="It was me"
                                variant="secondary"
                                onPress={() => vm.open("it-was-me")}
                            />
                        </View>
                        <View style={styles.action}>
                            <Button
                                label="It wasn't me"
                                variant="erase"
                                onPress={() => vm.open("it-wasnt-me")}
                            />
                        </View>
                    </>
                ) : (
                    <>
                        <View style={styles.action}>
                            <Button
                                label={vm.checking ? "Checking…" : "Check again"}
                                variant="secondary"
                                disabled={vm.checking}
                                onPress={vm.checkAgain}
                            />
                        </View>
                        <View style={styles.action}>
                            <Button
                                label="Start over from here"
                                variant="erase"
                                onPress={() => vm.open("start-over")}
                            />
                        </View>
                    </>
                )}
            </View>
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    banner: {
        marginHorizontal: 10,
        marginTop: 10,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: tint(theme.colors.idle, 0.4),
        backgroundColor: tint(theme.colors.idle, 0.1),
    },
    line: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    text: {
        flex: 1,
        fontFamily: "DM Sans",
        fontSize: 13.5,
        lineHeight: 19,
        color: theme.colors.foreground,
    },
    found: {
        marginTop: 8,
        fontFamily: "DM Sans",
        fontSize: 12.5,
        lineHeight: 18,
        color: theme.colors.mutedForeground,
    },
    actions: { flexDirection: "row", gap: 8, marginTop: 12 },
    action: { flex: 1 },
}))
