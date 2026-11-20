import { router } from "expo-router"
import { useState } from "react"
import { Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { resumeKeptSession, signOut } from "@/presentation/_libs/session"
import { useAppStore } from "@/store/store"

/** At launch, the instance didn't answer: the session is kept, to try again. */
export function UnreachablePage() {
    const insets = useSafeAreaInsets()
    const idpUrl = useAppStore((s) => s.idpUrl)
    const host = idpUrl ? new URL(idpUrl).host : "your server"
    const [trying, setTrying] = useState(false)
    const [again, setAgain] = useState(false)

    async function retry() {
        setTrying(true)
        const outcome = await resumeKeptSession()
        setTrying(false)
        if (outcome?.kind === "unreachable") setAgain(true)
        else router.replace("/")
    }

    return (
        <View style={styles.screen(insets.top, insets.bottom)}>
            <View style={styles.body}>
                <Text
                    accessibilityRole="header"
                    style={styles.title}
                >
                    Can&apos;t reach {host}
                </Text>
                <Text
                    accessibilityLiveRegion="polite"
                    style={styles.lede}
                >
                    {again
                        ? `Still no answer from ${host}. Your session is kept: try again in a moment.`
                        : "Your session is kept. Check your connection, or try again in a moment."}
                </Text>
            </View>
            <View style={styles.actions}>
                <Button
                    label={trying ? "Trying…" : "Try again"}
                    disabled={trying}
                    onPress={() => void retry()}
                />
                <Button
                    label="Sign out"
                    variant="quiet"
                    disabled={trying}
                    onPress={signOut}
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
    body: {
        flex: 1,
        justifyContent: "center",
        gap: 12,
    },
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
    actions: {
        gap: 10,
    },
}))
