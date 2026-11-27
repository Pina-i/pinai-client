import { BellRing } from "lucide-react-native"
import { Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { Sheet } from "@/presentation/molecules/sheet/sheet"
import { tint } from "@/theme/tint"
import { usePushOfferViewModel } from "./push-offer.viewmodel"

/** "Know when a device signs in": the notification permission, asked with its reason before Android asks. */
export function PushOffer() {
    const vm = usePushOfferViewModel()
    const { theme } = useUnistyles()
    return (
        <Sheet
            visible={vm.visible}
            label="Know when a device signs in"
            onClose={vm.onNotNow}
        >
            <View style={styles.offer}>
                <View style={styles.tile(tint(theme.colors.online, 0.16))}>
                    <BellRing
                        size={30}
                        color={theme.colors.online}
                        strokeWidth={1.9}
                    />
                </View>
                <Text
                    accessibilityRole="header"
                    style={styles.title}
                >
                    Know when a device signs in
                </Text>
                <Text style={styles.body}>
                    Pīna&apos;i tells you when a device asks to join your account or someone asks to start your history over,
                    even when the app is closed. The notice says nothing about you or your devices.
                </Text>
                <View style={styles.actions}>
                    <Button
                        label="Turn on"
                        onPress={vm.onTurnOn}
                    />
                    <Button
                        label="Not now"
                        variant="quiet"
                        onPress={vm.onNotNow}
                    />
                </View>
            </View>
        </Sheet>
    )
}

const styles = StyleSheet.create((theme) => ({
    offer: {
        alignItems: "center",
        gap: 12,
        paddingTop: 14,
        paddingHorizontal: 4,
    },
    tile: (background: string) => ({
        width: 64,
        height: 64,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 22,
        backgroundColor: background,
    }),
    title: {
        marginTop: 6,
        fontFamily: "DM Sans",
        fontSize: 20,
        fontWeight: "600",
        textAlign: "center",
        color: theme.colors.foreground,
    },
    body: {
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 21,
        textAlign: "center",
        color: theme.colors.mutedForeground,
    },
    actions: {
        alignSelf: "stretch",
        gap: 6,
        marginTop: 10,
    },
}))
