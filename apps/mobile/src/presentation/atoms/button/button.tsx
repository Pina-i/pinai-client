import { Pressable, Text } from "react-native"
import { StyleSheet } from "react-native-unistyles"

interface ButtonProps {
    label: string
    /**
     * `primary` commits (the palette's action colour); `secondary` sits on a surface; `quiet` is a text button in the
     * accent; `erase` and `erase-filled` lead to erasing something, the second the last step before it.
     */
    variant?: "primary" | "secondary" | "quiet" | "erase" | "erase-filled"
    disabled?: boolean
    onPress?: () => void
}

export function Button({ label, variant = "primary", disabled, onPress }: ButtonProps) {
    styles.useVariants({ variant })
    return (
        <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
        >
            <Text style={styles.label}>{label}</Text>
        </Pressable>
    )
}

const styles = StyleSheet.create((theme) => ({
    button: {
        width: "100%",
        alignItems: "center",
        justifyContent: "center",
        variants: {
            variant: {
                primary: { minHeight: 54, borderRadius: 16, backgroundColor: theme.colors.action },
                secondary: { minHeight: 50, borderRadius: 16, backgroundColor: theme.colors.surface2 },
                quiet: { minHeight: 44 },
                erase: { minHeight: 50, borderRadius: 16, backgroundColor: theme.colors.surface2 },
                "erase-filled": { minHeight: 54, borderRadius: 16, backgroundColor: theme.colors.destructive },
            },
        },
    },
    pressed: {
        transform: [{ scale: 0.98 }],
    },
    disabled: {
        opacity: 0.4,
    },
    label: {
        fontFamily: "DM Sans",
        variants: {
            variant: {
                primary: { fontSize: 16, fontWeight: "700", color: theme.colors.actionForeground },
                secondary: { fontSize: 15, fontWeight: "700", color: theme.colors.foreground },
                quiet: { fontSize: 15, fontWeight: "400", color: theme.colors.chat },
                erase: { fontSize: 15, fontWeight: "700", color: theme.colors.dndInk },
                "erase-filled": { fontSize: 16, fontWeight: "700", color: theme.colors.destructiveForeground },
            },
        },
    },
}))
