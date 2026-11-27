import { Text, View } from "react-native"
import { StyleSheet } from "react-native-unistyles"

/** The six digits typed so far, the next cell marked: what the number pad fills. */
export function TypedCode({ code, refused }: { code: string; refused?: boolean }) {
    return (
        <View
            accessible
            accessibilityLabel={`Code, ${code.length} of 6 digits entered`}
            style={styles.row}
        >
            {[0, 1, 2, 3, 4, 5].map((i) => (
                <View
                    key={i}
                    style={[styles.cell, i === code.length && styles.next, refused && styles.refused]}
                >
                    <Text style={styles.digit}>{code[i] ?? ""}</Text>
                </View>
            ))}
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    row: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 8,
    },
    cell: {
        width: 46,
        height: 58,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
    },
    next: {
        borderColor: theme.colors.chat,
        boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 3, color: theme.colors.chatSoft }],
    },
    refused: { borderColor: theme.colors.dnd },
    digit: {
        fontFamily: "Azeret Mono",
        fontSize: 24,
        color: theme.colors.foreground,
    },
}))
