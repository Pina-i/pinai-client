import { router } from "expo-router"
import { useEffect, useState } from "react"
import { ScrollView, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet } from "react-native-unistyles"
import { getE2eePort } from "@/ioc"
import { Button } from "@/presentation/atoms/button/button"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { WordsCard } from "@/presentation/molecules/words-card/words-card"

/**
 * The account's 24 words, from Settings › Devices: a route's form sheet, not a `Modal`, whose own window would leave
 * them capturable. Only the current words: kept ones a later generation replaced open nothing.
 */
export function WordsSheet() {
    const insets = useSafeAreaInsets()
    const [words, setWords] = useState<string[] | null>(null)
    const [missing, setMissing] = useState(false)

    useEffect(() => {
        let live = true
        const port = getE2eePort()
        port.historyKeyStanding()
            .then(async (standing) => (standing.kind === "holds" ? port.loadStoredPassphrase() : null))
            .then((kept) => {
                if (!live) return
                setWords(kept)
                setMissing(kept === null)
            })
            .catch((error: unknown) => {
                warnE2ee("reading the history passphrase", error)
                if (live) setMissing(true)
            })
        return () => {
            live = false
        }
    }, [])

    return (
        <ScrollView contentContainerStyle={styles.body(insets.bottom)}>
            <View
                importantForAccessibility="no-hide-descendants"
                style={styles.grabber}
            />
            <Text style={styles.eyebrow}>History</Text>
            <Text
                accessibilityRole="header"
                style={styles.title}
            >
                Your 24 words
            </Text>
            <Text style={styles.lede}>
                With these words and your password, someone can read your history and approve a device as you. Keep them somewhere only
                you can reach.
            </Text>
            {words && <WordsCard words={words} />}
            {missing && <Text style={styles.lede}>This device doesn&apos;t hold your account&apos;s current words.</Text>}
            <View style={styles.footer}>
                <Button
                    label="Done"
                    variant="secondary"
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
    footer: { marginTop: 16 },
}))
