import { Pressable, Switch, Text } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"

interface SwitchRowProps {
    label: string
    value: boolean
    onValueChange: (value: boolean) => void
    minHeight?: number
}

/** A row of a `Group`: what it sets, and its switch. The whole row is the switch, to touch and to a screen reader. */
export function SwitchRow({ label, value, onValueChange, minHeight = 52 }: SwitchRowProps) {
    const { theme } = useUnistyles()
    return (
        <Pressable
            accessibilityRole="switch"
            accessibilityLabel={label}
            accessibilityState={{ checked: value }}
            onPress={() => onValueChange(!value)}
            style={({ pressed }) => [styles.row, { minHeight }, pressed && styles.pressed]}
        >
            <Text style={styles.label}>{label}</Text>
            <Switch
                importantForAccessibility="no"
                value={value}
                onValueChange={onValueChange}
                trackColor={{ false: theme.colors.surface3, true: theme.colors.online }}
                thumbColor={theme.colors.actionForeground}
            />
        </Pressable>
    )
}

const styles = StyleSheet.create((theme) => ({
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    pressed: {
        backgroundColor: theme.colors.surface2,
    },
    label: {
        flex: 1,
        fontFamily: "DM Sans",
        fontSize: 15,
        lineHeight: 20,
        color: theme.colors.foreground,
    },
}))
