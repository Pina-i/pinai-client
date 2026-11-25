import { ScrollView, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { SegmentedTabs } from "@/presentation/molecules/segmented-tabs/segmented-tabs"
import { DeviceWay } from "@/presentation/organisms/device-way/device-way"
import { StartOverWay } from "@/presentation/organisms/start-over-way/start-over-way"
import { WordsWay } from "@/presentation/organisms/words-way/words-way"
import { useHistoryResetSheet } from "./history-reset.viewmodel"

const BACK_TABS = [
    { id: "device", label: "That device" },
    { id: "words", label: "Its 24 words" },
] as const

const PASSWORD_FIRST =
    "Someone else has it. Change it with a reset link — “Forgot password?” on your instance's sign-in page, or ask its admin for one. That signs every session out, theirs and this one: once you've signed in again, choose “It wasn't me” on this banner once more. This device then waits like any other: it can finish starting over once the device that reset your history has gone 7 days unused. As long as they can still use it, it never finishes — which is why the password comes first."

/** The history-reset banner's sheet, one of its three ways. */
export function HistoryResetSheet() {
    const vm = useHistoryResetSheet()
    const insets = useSafeAreaInsets()

    const startOver = (
        <StartOverWay
            reason={vm.way === "it-wasnt-me" ? "password-changed" : "unknown-change"}
            refused={vm.way === "it-wasnt-me" ? vm.setter : null}
            own={vm.own}
            ready
            returnTo={vm.returnTo}
            onStartedOver={vm.onStartedOver}
            onWentOtherwise={vm.onWentOtherwise}
            onRolledBack={vm.onRolledBack}
            onBusy={vm.onStartOverBusy}
        />
    )

    return (
        <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.body(insets.bottom)}
        >
            <View
                importantForAccessibility="no-hide-descendants"
                style={styles.grabber}
            />
            {vm.notice && (
                <Text
                    accessibilityLiveRegion="polite"
                    style={styles.notice}
                >
                    {vm.notice}
                </Text>
            )}

            {vm.rolledBack ? (
                <>
                    <Text style={styles.eyebrow}>What happened</Text>
                    <Text
                        accessibilityRole="header"
                        style={styles.title}
                    >
                        Only your instance can put it back
                    </Text>
                    <Text style={styles.lede}>
                        Your instance went back on your account&apos;s history key: it now serves an older one than your devices have seen. No device
                        can start over from it.
                    </Text>
                </>
            ) : vm.way === "it-was-me" ? (
                <>
                    <Text style={styles.eyebrow}>It was me</Text>
                    <Text
                        accessibilityRole="header"
                        style={styles.title}
                    >
                        Let this device back in
                    </Text>
                    <Text style={styles.lede}>
                        Approve it from the device you started over on, or type the new words from it. Then it saves your history again.
                    </Text>
                    <SegmentedTabs
                        label="How to let this device back in"
                        tabs={BACK_TABS}
                        selected={vm.tab === "words" ? "words" : "device"}
                        onSelect={vm.setTab}
                        disabled={vm.busy}
                    />
                    <View style={styles.way}>
                        {vm.tab === "words" ? (
                            <WordsWay
                                active
                                setUp={vm.setUp}
                                onTyping={vm.onTyping}
                                onIn={vm.done}
                                help="The new words, from the device that reset your history: your old ones no longer open it. Pasting all of them at once works."
                            />
                        ) : (
                            <DeviceWay
                                active
                                deviceReady
                                share={vm.share}
                                onApproved={vm.onApproved}
                                onIn={vm.done}
                                instruction="Open Pīna'i on the device that reset your history and type this code when it asks."
                            />
                        )}
                    </View>
                </>
            ) : vm.way === "it-wasnt-me" ? (
                <>
                    <Text style={[styles.eyebrow, styles.danger]}>First, your password</Text>
                    <Text
                        accessibilityRole="header"
                        style={[styles.title, styles.danger]}
                    >
                        Change your password
                    </Text>
                    <Text style={styles.lede}>{PASSWORD_FIRST}</Text>
                    <View style={styles.way}>{startOver}</View>
                </>
            ) : (
                <View style={styles.way}>{startOver}</View>
            )}

            <View style={styles.footer}>
                <Button
                    label={vm.rolledBack ? "Close" : "Not now"}
                    variant="quiet"
                    disabled={vm.busy}
                    onPress={vm.close}
                />
            </View>
        </ScrollView>
    )
}

const styles = StyleSheet.create((theme) => ({
    body: (bottom: number) => ({
        paddingHorizontal: 20,
        paddingBottom: Math.max(bottom, 16) + 16,
    }),
    grabber: {
        alignSelf: "center",
        width: 40,
        height: 4,
        borderRadius: 2,
        marginTop: 10,
        marginBottom: 14,
        backgroundColor: theme.colors.borderStrong,
    },
    notice: {
        marginBottom: 12,
        fontFamily: "DM Sans",
        fontSize: 13,
        lineHeight: 19,
        color: theme.colors.idleInk,
    },
    eyebrow: {
        fontFamily: "DM Sans",
        fontSize: 11,
        fontWeight: "500",
        letterSpacing: 0.11,
        color: theme.colors.mutedForeground,
    },
    danger: { color: theme.colors.dndInk },
    title: {
        marginTop: 4,
        fontFamily: "Instrument Serif",
        fontSize: 28,
        lineHeight: 32,
        color: theme.colors.foreground,
    },
    lede: {
        marginTop: 8,
        marginBottom: 16,
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 21,
        color: theme.colors.mutedForeground,
    },
    way: { marginTop: 16 },
    footer: { marginTop: 12 },
}))
