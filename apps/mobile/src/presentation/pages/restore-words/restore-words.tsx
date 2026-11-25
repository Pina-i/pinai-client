import { router } from "expo-router"
import { useState } from "react"
import { ScrollView, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { reviewDevices } from "@/presentation/_libs/device-review"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { WordsWay } from "@/presentation/organisms/words-way/words-way"

const noSetUp = () => null

/**
 * "Restore history from words" for a device already in but not holding the current words: typed, it holds the key
 * again — and approves the others. The phone keeps no messages yet, so nothing is brought back to show.
 */
export function RestoreWordsSheet() {
    const insets = useSafeAreaInsets()
    const [busy, setBusy] = useState(false)
    const done = () => {
        reviewDevices().catch((error: unknown) => warnE2ee("reviewing the device list", error))
        if (router.canGoBack()) router.back()
    }
    return (
        <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.body(insets.bottom)}
        >
            <View
                importantForAccessibility="no-hide-descendants"
                style={styles.grabber}
            />
            <Text style={styles.eyebrow}>History</Text>
            <Text
                accessibilityRole="header"
                style={styles.title}
            >
                Bring your history&apos;s key here
            </Text>
            <Text style={styles.lede}>
                Type your account&apos;s 24 words: this device then holds your history&apos;s key again, and can approve your other
                devices.
            </Text>
            <WordsWay
                active
                setUp={noSetUp}
                onTyping={setBusy}
                onIn={done}
                help="Your account's 24 words, from where you saved them. Pasting all of them at once works."
            />
            <View style={styles.footer}>
                <Button
                    label="Close"
                    variant="quiet"
                    disabled={busy}
                    onPress={() => router.back()}
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
    eyebrow: {
        fontFamily: "DM Sans",
        fontSize: 11,
        fontWeight: "500",
        letterSpacing: 0.11,
        color: theme.colors.mutedForeground,
    },
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
    footer: { marginTop: 12 },
}))
