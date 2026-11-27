import { Text, useWindowDimensions, View } from "react-native"
import { StyleSheet } from "react-native-unistyles"

const GAP = 6
const DOT = 6 + 8
// The screen's and the card's side padding: the six cells share what is left.
const AROUND = 2 * 20 + 2 * 16 + 2

/** The approval code, 3 + 3, large: what another device types. Empty cells until it comes. */
export function CodeCells({ halves }: { halves: [string, string] | null }) {
    const { width } = useWindowDimensions()
    const cell = Math.min(48, Math.floor((width - AROUND - DOT - 6 * GAP) / 6))
    const [first, second] = halves ?? ["", ""]
    const spelled = (half: string) => half.split("").join(" ")
    return (
        <View
            accessible
            accessibilityLabel={halves ? `Approval code ${spelled(first)}, ${spelled(second)}` : "Approval code coming"}
            style={styles.row}
        >
            {[0, 1, 2].map((i) => (
                <Cell
                    key={i}
                    width={cell}
                    digit={first[i] ?? ""}
                />
            ))}
            <View style={styles.dot} />
            {[0, 1, 2].map((i) => (
                <Cell
                    key={i}
                    width={cell}
                    digit={second[i] ?? ""}
                />
            ))}
        </View>
    )
}

function Cell({ width, digit }: { width: number; digit: string }) {
    return (
        <View style={styles.cell(width)}>
            <Text style={styles.digit}>{digit}</Text>
            <View style={styles.underline} />
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: GAP,
    },
    cell: (width: number) => ({
        width,
        height: 64,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
    }),
    digit: {
        fontFamily: "Instrument Serif",
        fontSize: 40,
        color: theme.colors.foreground,
    },
    underline: {
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 9,
        height: 2,
        borderRadius: 1,
        backgroundColor: theme.colors.action,
    },
    dot: {
        width: 6,
        height: 6,
        marginHorizontal: 4,
        borderRadius: 3,
        backgroundColor: theme.colors.borderStrong,
    },
}))
