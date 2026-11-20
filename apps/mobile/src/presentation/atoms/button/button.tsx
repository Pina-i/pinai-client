import { Pressable, Text } from "react-native"
import { StyleSheet } from "react-native-unistyles"

interface ButtonProps {
    label: string
    /** `primary` commits (the palette's action colour); `quiet` is a text button in the accent. */
    variant?: "primary" | "quiet"
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
                quiet: { minHeight: 44 },
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
                quiet: { fontSize: 15, fontWeight: "400", color: theme.colors.chat },
            },
        },
    },
}))
