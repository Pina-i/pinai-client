import type { RosterDevice } from "@pinai/domain/models/device-roster"
import { ChevronRight } from "lucide-react-native"
import { Pressable, Text, View } from "react-native"
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { DeviceIcon } from "./device-icon"

interface DeviceRowProps {
    device: RosterDevice
    meta: string
    /** Swiping left offers "Sign out"; `false` for a device that can't be signed out from here. */
    swipeable: boolean
    onOpen: () => void
    onSignOut: () => void
}

/** Another device of the account: a tap for its details, a swipe to the left to sign it out. */
export function DeviceRow({ device, meta, swipeable, onOpen, onSignOut }: DeviceRowProps) {
    const { theme } = useUnistyles()
    const out = device.revoked_at !== null
    const name = device.display_name.trim() || "A device"
    return (
        <ReanimatedSwipeable
            enabled={swipeable}
            friction={2}
            rightThreshold={40}
            overshootRight={false}
            renderRightActions={(_progress, _translation, swipe) => (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Sign out ${name}`}
                    onPress={() => {
                        swipe.close()
                        onSignOut()
                    }}
                    style={styles.action}
                >
                    <Text style={styles.actionLabel}>Sign out</Text>
                </Pressable>
            )}
        >
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${meta}`}
                accessibilityHint="Opens its details"
                accessibilityActions={swipeable ? [{ name: "signOut", label: "Sign out" }] : undefined}
                onAccessibilityAction={(event) => {
                    if (event.nativeEvent.actionName === "signOut") onSignOut()
                }}
                onPress={onOpen}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
                <View style={out && styles.dimmed}>
                    <DeviceIcon
                        kind={device.kind}
                        color={theme.colors.foreground}
                        background={theme.colors.surface2}
                    />
                </View>
                <View style={styles.text}>
                    <Text
                        numberOfLines={1}
                        style={[styles.name, out && styles.dimmed]}
                    >
                        {name}
                    </Text>
                    <Text
                        numberOfLines={1}
                        style={styles.meta}
                    >
                        {meta}
                    </Text>
                </View>
                <ChevronRight
                    size={18}
                    color={theme.colors.mutedForeground}
                    strokeWidth={1.9}
                />
            </Pressable>
        </ReanimatedSwipeable>
    )
}

const styles = StyleSheet.create((theme) => ({
    row: {
        minHeight: 64,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        backgroundColor: theme.colors.surface1,
    },
    pressed: { backgroundColor: theme.colors.surface2 },
    text: { flex: 1, minWidth: 0, gap: 2 },
    name: {
        fontFamily: "DM Sans",
        fontSize: 16,
        color: theme.colors.foreground,
    },
    meta: {
        fontFamily: "DM Sans",
        fontSize: 12.5,
        color: theme.colors.mutedForeground,
    },
    dimmed: { opacity: 0.5 },
    action: {
        width: 96,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.dnd,
    },
    actionLabel: {
        fontFamily: "DM Sans",
        fontSize: 13,
        fontWeight: "600",
        color: "#ffffff",
    },
}))
