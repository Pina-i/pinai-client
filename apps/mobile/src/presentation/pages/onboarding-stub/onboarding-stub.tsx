import { Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { signOut } from "@/presentation/_libs/session"

/** Where the gate sends a device that isn't in, until its screen is built. */
export function OnboardingStubPage({ title }: { title: string }) {
    const insets = useSafeAreaInsets()
    return (
        <View style={styles.screen(insets.top, insets.bottom)}>
            <View style={styles.body}>
                <Text
                    accessibilityRole="header"
                    style={styles.title}
                >
                    {title}
                </Text>
                <Text style={styles.lede}>
                    This screen is on its way. Meanwhile, let this device in from Pīna&apos;i on the web or the desktop app.
                </Text>
            </View>
            <View style={styles.actions}>
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
