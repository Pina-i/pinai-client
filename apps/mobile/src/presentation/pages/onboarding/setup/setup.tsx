import { TriangleAlert } from "lucide-react-native"
import { ActivityIndicator, ScrollView, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { Group } from "@/presentation/molecules/group/group"
import { SwitchRow } from "@/presentation/molecules/switch-row/switch-row"
import { WordsCard } from "@/presentation/molecules/words-card/words-card"
import { useSetupViewModel } from "./setup.viewmodel"

/** The first device's 24 words, after the prototype's "Save your 24 words". */
export function SetupPage() {
    const insets = useSafeAreaInsets()
    const { theme } = useUnistyles()
    const { view, saved, setSaved, onStart, onRetry, onSignOut } = useSetupViewModel()

    if (view.kind === "loading") {
        return (
            <View style={[styles.screen(insets.top, insets.bottom), styles.centered]}>
                <ActivityIndicator color={theme.colors.mutedForeground} />
                <Text
                    accessibilityLiveRegion="polite"
                    style={styles.lede}
                >
                    {view.stage === "checking" ? "Checking your words…" : "Setting up this device…"}
                </Text>
            </View>
        )
    }

    if (view.kind === "failed") {
        return (
            <View style={styles.screen(insets.top, insets.bottom)}>
                <View style={styles.body}>
                    <Text
                        accessibilityRole="header"
                        style={styles.title}
                    >
                        Couldn&apos;t set up this device
                    </Text>
                    <Text style={styles.lede}>{view.message}</Text>
                </View>
                <View style={styles.actions}>
                    <Button
                        label="Try again"
                        onPress={onRetry}
                    />
                    <Button
                        label="Sign out"
                        variant="quiet"
                        onPress={onSignOut}
                    />
                </View>
            </View>
        )
    }

    return (
        <View style={styles.screen(insets.top, insets.bottom)}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <Text
                    accessibilityRole="header"
                    style={styles.title}
                >
                    {view.fresh ? "Your new 24 words" : "Save your 24 words"}
                </Text>
                <Text style={styles.lede}>
                    {view.fresh
                        ? "You started your history over: these words replace the old ones. Your other devices need them to come back."
                        : "On a new phone, with no other device around, they bring your conversation history back. Made on this device — we never see them."}
                </Text>
                <WordsCard words={view.words} />
                <View style={styles.warning}>
                    <View style={styles.warningIcon}>
                        <TriangleAlert
                            size={14}
                            color={theme.colors.idleInk}
                            strokeWidth={1.9}
                        />
                    </View>
                    <Text style={styles.warningText}>
                        Anyone with these words can read your history. Write them on paper — don&apos;t screenshot them.
                    </Text>
                </View>
                <Group>
                    <SwitchRow
                        label="I've written them down somewhere safe"
                        value={saved}
                        onValueChange={setSaved}
                    />
                </Group>
            </ScrollView>
            <View style={styles.actions}>
                <Button
                    label={view.fresh ? "Continue" : "Start using Pīna'i"}
                    disabled={!saved}
                    onPress={onStart}
                />
            </View>
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    screen: (top: number, bottom: number) => ({
        flex: 1,
        paddingTop: top,
        paddingBottom: Math.max(bottom, 16) + 8,
        paddingHorizontal: 20,
        backgroundColor: theme.colors.background,
    }),
    centered: { alignItems: "center", justifyContent: "center", gap: 14 },
    body: { flex: 1, justifyContent: "center", gap: 12 },
    scroll: { gap: 16, paddingTop: 16, paddingBottom: 16 },
    title: {
        fontFamily: "Instrument Serif",
        fontSize: 32,
        letterSpacing: -0.48,
        color: theme.colors.foreground,
    },
    lede: {
        fontFamily: "DM Sans",
        fontSize: 15,
        lineHeight: 22.5,
        color: theme.colors.mutedForeground,
    },
    warning: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 6,
        paddingHorizontal: 16,
    },
    warningIcon: { marginTop: 2 },
    warningText: {
        flex: 1,
        fontFamily: "DM Sans",
        fontSize: 12.5,
        lineHeight: 18,
        color: theme.colors.idleInk,
    },
    actions: { gap: 10, paddingTop: 12 },
}))
