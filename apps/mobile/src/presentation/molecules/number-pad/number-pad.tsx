import { Delete } from "lucide-react-native"
import { Pressable, Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"

const KEYS = [
    ["1", ""],
    ["2", "ABC"],
    ["3", "DEF"],
    ["4", "GHI"],
    ["5", "JKL"],
    ["6", "MNO"],
    ["7", "PQRS"],
    ["8", "TUV"],
    ["9", "WXYZ"],
] as const

interface NumberPadProps {
    onDigit: (digit: string) => void
    onDelete: () => void
    disabled?: boolean
}

/** A phone's keypad for a short code: the system keyboard would cover the code it is typed into. */
export function NumberPad({ onDigit, onDelete, disabled }: NumberPadProps) {
    const { theme } = useUnistyles()
    const key = (digit: string, letters: string) => (
        <Pressable
            key={digit}
            accessibilityRole="button"
            accessibilityLabel={digit}
            disabled={disabled}
            onPress={() => onDigit(digit)}
            style={({ pressed }) => [styles.key, pressed && styles.pressed]}
        >
            <Text style={styles.digit}>{digit}</Text>
            <Text style={styles.letters}>{letters || " "}</Text>
        </Pressable>
    )
    return (
        <View
            accessibilityLabel="Number pad"
            style={styles.pad}
        >
            {KEYS.map(([digit, letters]) => key(digit, letters))}
            <View style={styles.blank} />
            {key("0", "")}
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete"
                disabled={disabled}
                onPress={onDelete}
                style={({ pressed }) => [styles.key, styles.ghost, pressed && styles.pressed]}
            >
                <Delete
                    size={24}
                    color={theme.colors.foreground}
                    strokeWidth={1.9}
                />
            </Pressable>
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    pad: {
        flexDirection: "row",
        flexWrap: "wrap",
        rowGap: 8,
        columnGap: 8,
    },
    key: {
        flexBasis: "30%",
        flexGrow: 1,
        minHeight: 56,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        backgroundColor: theme.colors.surface2,
    },
    ghost: { backgroundColor: "transparent" },
    pressed: { backgroundColor: theme.colors.surface3 },
    blank: { flexBasis: "30%", flexGrow: 1 },
    digit: {
        fontFamily: "DM Sans",
        fontSize: 24,
        fontWeight: "500",
        lineHeight: 26,
        color: theme.colors.foreground,
    },
    letters: {
        marginTop: 2,
        fontFamily: "DM Sans",
        fontSize: 9,
        fontWeight: "500",
        letterSpacing: 1.3,
        color: theme.colors.mutedForeground,
    },
}))
