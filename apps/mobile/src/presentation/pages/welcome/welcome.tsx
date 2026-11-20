import { Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet } from "react-native-unistyles"
import { Backdrop } from "@/presentation/atoms/backdrop/backdrop"
import { Button } from "@/presentation/atoms/button/button"
import { Logo } from "@/presentation/atoms/logo/logo"
import { Motif } from "@/presentation/atoms/motif/motif"

/** Before any instance: what Pīna'i is, and the way in. */
export function WelcomePage() {
    const insets = useSafeAreaInsets()

    return (
        <View style={styles.screen}>
            <Backdrop />
            <View style={styles.body(insets.top)}>
                <View style={styles.intro}>
                    <Logo size={64} />
                    <Text
                        accessibilityRole="header"
                        style={styles.title}
                    >
                        Quiet <Text style={styles.rooms}>rooms</Text>,{"\n"}loud <Text style={styles.voices}>voices</Text>.
                    </Text>
                    <Text
                        textBreakStrategy="balanced"
                        style={styles.lede}
                    >
                        Group chat that respects your privacy, on a server you choose.
                    </Text>
                    <Motif
                        variant="band"
                        size={10}
                        style={styles.band}
                    />
                </View>
            </View>
            <View style={styles.actions(insets.bottom)}>
                <Button label="Continue" />
                <Button
                    label="I run my own server"
                    variant="quiet"
                />
                <Text
                    textBreakStrategy="balanced"
                    style={styles.note}
                >
                    Pīna&apos;i is federated — your account lives on a server.
                </Text>
            </View>
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    screen: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    body: (top: number) => ({
        flex: 1,
        justifyContent: "center",
        paddingTop: top,
        paddingHorizontal: 20,
    }),
    intro: {
        alignItems: "center",
        gap: 18,
    },
    title: {
        marginTop: 4,
        fontFamily: "Instrument Serif",
        fontSize: 46,
        lineHeight: 45,
        letterSpacing: -1.15,
        textAlign: "center",
        color: theme.colors.foreground,
    },
    rooms: {
        fontStyle: "italic",
        color: theme.colors.chat,
    },
    voices: {
        fontStyle: "italic",
        color: theme.colors.voice,
    },
    lede: {
        maxWidth: 240,
        fontFamily: "DM Sans",
        fontSize: 15,
        lineHeight: 22.5,
        textAlign: "center",
        color: theme.colors.mutedForeground,
    },
    band: {
        width: 140,
    },
    actions: (bottom: number) => ({
        gap: 10,
        paddingTop: 16,
        paddingHorizontal: 20,
        paddingBottom: Math.max(bottom, 16) + 8,
    }),
    note: {
        marginTop: 2,
        fontFamily: "Azeret Mono",
        fontSize: 11,
        letterSpacing: 0.22,
        textAlign: "center",
        color: theme.colors.mutedForeground,
    },
}))
