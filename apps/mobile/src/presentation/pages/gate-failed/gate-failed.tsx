import { Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { signOut } from "@/presentation/_libs/session"

/** The gate couldn't decide whether this device is in: nothing of the app shows until it does. */
export function GateFailedPage({ onRetry }: { onRetry: () => void }) {
    const insets = useSafeAreaInsets()
    return (
        <View style={styles.screen(insets.top, insets.bottom)}>
            <View style={styles.body}>
                <Text
                    accessibilityRole="header"
                    style={styles.title}
                >
                    Can&apos;t check this device
                </Text>
                <Text style={styles.lede}>
                    Pīna&apos;i couldn&apos;t tell whether this device may open your conversations. Check your connection, then try again.
                </Text>
            </View>
            <View style={styles.actions}>
                <Button
                    label="Try again"
                    onPress={onRetry}
                />
                <Button
                    label="Sign out"
                    variant="quiet"
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
