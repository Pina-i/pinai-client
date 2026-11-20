import { personName } from "@pinai/domain/models/identity"
import { Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { signOut } from "@/presentation/_libs/session"
import { useAppStore } from "@/store/store"

/** Where a sign-in lands until the shell arrives: who, where, and the way out. */
export function HomePage() {
    const insets = useSafeAreaInsets()
    const user = useAppStore((s) => s.user)
    const idpUrl = useAppStore((s) => s.idpUrl)

    return (
        <View style={styles.screen(insets.top, insets.bottom)}>
            <View style={styles.body}>
                <Text style={styles.caption}>Signed in as</Text>
                <Text
                    accessibilityRole="header"
                    style={styles.name}
                >
                    {user ? personName(user.actor_uri, user.display_name) : ""}
                </Text>
                <Text style={styles.host}>{idpUrl ? new URL(idpUrl).host : ""}</Text>
            </View>
            <Button
                label="Sign out"
                variant="quiet"
                onPress={signOut}
            />
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
        alignItems: "center",
        gap: 6,
    },
    caption: {
        fontFamily: "DM Sans",
        fontSize: 13,
        color: theme.colors.mutedForeground,
    },
    name: {
        fontFamily: "Instrument Serif",
        fontSize: 30,
        color: theme.colors.foreground,
    },
    host: {
        fontFamily: "Azeret Mono",
        fontSize: 11,
        letterSpacing: 0.22,
        color: theme.colors.mutedForeground,
    },
}))
