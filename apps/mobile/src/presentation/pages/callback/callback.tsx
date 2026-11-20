import { Text, View } from "react-native"
import { StyleSheet } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { Logo } from "@/presentation/atoms/logo/logo"
import { type CallbackFailure, useCallbackViewModel } from "./callback.viewmodel"

function words(failure: CallbackFailure): { title: string; lede: string } {
    switch (failure.kind) {
        case "interrupted":
            return { title: "Sign-in was interrupted", lede: "The app closed while your server's page was open. Try again." }
        case "refused":
            return { title: "Sign-in failed", lede: "Your server ended the sign-in." }
        case "failed":
            return { title: "Sign-in failed", lede: "Something went wrong signing you in. Try again." }
    }
}

/** The IdP's answer: signed in, or why not. */
export function CallbackPage({ params }: { params: Record<string, string> }) {
    const vm = useCallbackViewModel(params)

    if (!vm.failure) {
        return (
            <View style={styles.screen}>
                <View style={styles.center}>
                    <Logo size={40} />
                    <Text
                        accessibilityLiveRegion="polite"
                        style={styles.lede}
                    >
                        Signing in…
                    </Text>
                </View>
            </View>
        )
    }

    const { title, lede } = words(vm.failure)
    return (
        <View style={styles.screen}>
            <View style={styles.center}>
                <Text
                    accessibilityRole="header"
                    style={styles.title}
                >
                    {title}
                </Text>
                <Text style={styles.lede}>{lede}</Text>
                {vm.failure.kind === "refused" && vm.failure.code && <Text style={styles.code}>{vm.failure.code}</Text>}
            </View>
            <Button
                label="Try again"
                onPress={vm.tryAgain}
            />
        </View>
    )
}

const styles = StyleSheet.create((theme, rt) => ({
    screen: {
        flex: 1,
        paddingTop: rt.insets.top,
        paddingBottom: rt.insets.bottom + 24,
        paddingHorizontal: 20,
        backgroundColor: theme.colors.background,
    },
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
    },
    title: {
        fontFamily: "Instrument Serif",
        fontSize: 32,
        letterSpacing: -0.48,
        textAlign: "center",
        color: theme.colors.foreground,
    },
    lede: {
        fontFamily: "DM Sans",
        fontSize: 15,
        lineHeight: 22.5,
        textAlign: "center",
        color: theme.colors.mutedForeground,
    },
    code: {
        fontFamily: "Azeret Mono",
        fontSize: 11,
        letterSpacing: 0.22,
        color: theme.colors.mutedForeground,
    },
}))
