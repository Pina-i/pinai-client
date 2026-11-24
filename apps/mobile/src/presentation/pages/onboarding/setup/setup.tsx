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
    const { view, saved, setSaved, markSeen, canStart, onStart, onRetry, onSignOut } = useSetupViewModel()

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
                {!view.fresh && (
                    <View style={styles.step}>
                        <Text style={styles.stepLabel}>Step 2 of 2</Text>
                        <View
                            importantForAccessibility="no-hide-descendants"
                            style={styles.stepBars}
                        >
                            <View style={styles.stepBar} />
                            <View style={styles.stepBar} />
                        </View>
                    </View>
                )}
                <Text
                    accessibilityRole="header"
                    style={styles.title}
                >
                    {view.fresh ? "Your new 24 words" : "Save your 24 words"}
                </Text>
                <Text style={[styles.lede, styles.intro]}>
                    {view.fresh
                        ? "You started your history over: these words replace the old ones. Your other devices need them to come back."
                        : "On a new phone, with no other device around, they bring your conversation history back. Made on this device — we never see them."}
                </Text>
                <WordsCard
                    words={view.words}
                    onSeen={markSeen}
                />
                <View style={styles.warning}>
                    <View style={styles.warningIcon}>
                        <TriangleAlert
                            size={14}
                            color={theme.colors.idleInk}
                            strokeWidth={1.9}
                        />
                    </View>
                    <Text style={styles.warningText}>
                        Anyone with these words can read your history. Write them on paper or keep them in a password manager —
                        don&apos;t screenshot them.
                    </Text>
                </View>
                <View style={styles.saved}>
                    <Group>
                        <SwitchRow
                            label="I've saved them somewhere safe"
                            value={saved}
                            onValueChange={setSaved}
                            minHeight={64}
                        />
                    </Group>
                </View>
            </ScrollView>
            <View style={styles.actions}>
                <Button
                    label={view.fresh ? "Continue" : "Start using Pīna'i"}
                    disabled={!canStart}
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
    scroll: { paddingTop: 16, paddingBottom: 16 },
    step: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 14,
    },
    stepLabel: {
        fontFamily: "DM Sans",
        fontSize: 13,
        color: theme.colors.mutedForeground,
    },
    stepBars: {
        flexDirection: "row",
        gap: 4,
        marginLeft: "auto",
    },
    stepBar: {
        width: 22,
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.colors.chat,
    },
    title: {
        fontFamily: "Instrument Serif",
        fontSize: 34,
        lineHeight: 36,
        letterSpacing: -0.51,
        color: theme.colors.foreground,
    },
    lede: {
        fontFamily: "DM Sans",
        fontSize: 15,
        lineHeight: 22.5,
        color: theme.colors.mutedForeground,
    },
    intro: { marginTop: 8, marginBottom: 20 },
    warning: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 6,
        marginTop: 8,
        paddingHorizontal: 16,
    },
    saved: { marginTop: 18 },
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
