import { Text, View } from "react-native"
import { StyleSheet } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import type { RecentSignIn } from "@/presentation/hooks/use-recent-sign-in"
import { Sheet } from "@/presentation/molecules/sheet/sheet"

/** "Type your password again": the IdP's page opens in the system's sheet, and the app comes back right here. */
export function RecentSignInSheet({ recentSignIn }: { recentSignIn: RecentSignIn }) {
    const { asking, host, leaving, failed } = recentSignIn
    return (
        <Sheet
            visible={asking !== null}
            label="Type your password again"
            onClose={leaving ? undefined : recentSignIn.dismiss}
        >
            <Text
                accessibilityRole="header"
                style={styles.title}
            >
                Type your password again
            </Text>
            <Text style={styles.body}>
                To {asking}, sign in again on {host}. You&apos;ll come back right here.
            </Text>
            {failed && (
                <Text
                    accessibilityLiveRegion="polite"
                    style={styles.failed}
                >
                    {failed}
                </Text>
            )}
            <View style={styles.actions}>
                <Button
                    label={leaving ? "Taking you there…" : "Continue"}
                    disabled={leaving}
                    onPress={recentSignIn.signInAgain}
                />
                <Button
                    label="Cancel"
                    variant="quiet"
                    disabled={leaving}
                    onPress={recentSignIn.dismiss}
                />
            </View>
        </Sheet>
    )
}

const styles = StyleSheet.create((theme) => ({
    title: {
        fontFamily: "DM Sans",
        fontSize: 17,
        fontWeight: "700",
        textAlign: "center",
        color: theme.colors.foreground,
    },
    body: {
        marginTop: 8,
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 21,
        textAlign: "center",
        color: theme.colors.mutedForeground,
    },
    failed: {
        marginTop: 10,
        fontFamily: "DM Sans",
        fontSize: 13,
        lineHeight: 19,
        textAlign: "center",
        color: theme.colors.dndInk,
    },
    actions: { gap: 8, marginTop: 18 },
}))
