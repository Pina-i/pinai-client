import type { ReactNode } from "react"
import { Text, View } from "react-native"
import { StyleSheet } from "react-native-unistyles"

interface InitialTileProps {
    /** A letter, set in the serif; or an icon. */
    children: ReactNode
}

/** The 44 dp tile that stands for an instance or an action in a row. */
export function InitialTile({ children }: InitialTileProps) {
    return (
        <View
            importantForAccessibility="no-hide-descendants"
            style={styles.tile}
        >
            {typeof children === "string" ? <Text style={styles.initial}>{children}</Text> : children}
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    tile: {
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        backgroundColor: theme.colors.surface2,
    },
    initial: {
        fontFamily: "Instrument Serif",
        fontSize: 17,
        fontWeight: "600",
        color: theme.colors.foreground,
    },
}))
