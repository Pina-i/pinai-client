import type { DeviceKind } from "@pinai/domain/models/device"
import { HelpCircle, Laptop, Smartphone, Tablet } from "lucide-react-native"
import { View } from "react-native"
import { StyleSheet } from "react-native-unistyles"

const ICONS = { laptop: Laptop, phone: Smartphone, tablet: Tablet, unknown: HelpCircle } as const

/** A device's kind as a tile, in the colours given. */
export function DeviceIcon({ kind, color, background }: { kind: DeviceKind; color: string; background: string }) {
    const Icon = ICONS[kind]
    return (
        <View style={styles.tile(background)}>
            <Icon
                size={17}
                color={color}
                strokeWidth={1.9}
            />
        </View>
    )
}

const styles = StyleSheet.create(() => ({
    tile: (background: string) => ({
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        backgroundColor: background,
    }),
}))
