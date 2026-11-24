import { Eye } from "lucide-react-native"
import { Pressable, Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Group } from "@/presentation/molecules/group/group"
import { SwitchRow } from "@/presentation/molecules/switch-row/switch-row"
import { useWordsCard } from "./words-card.viewmodel"

const MASK = "••••••"

/** The account's 24 words, numbered in two columns read in rows: hidden until held, or kept visible. */
export function WordsCard({ words }: { words: string[] }) {
    const card = useWordsCard()
    const { theme } = useUnistyles()

    return (
        <View style={styles.stack}>
            <Group>
                <View style={styles.card}>
                    <View
                        style={styles.grid}
                        accessibilityElementsHidden={!card.shown}
                        importantForAccessibility={card.shown ? "auto" : "no-hide-descendants"}
                    >
                        {words.map((word, i) => (
                            <View
                                key={i}
                                style={styles.cell}
                                accessible
                                accessibilityLabel={`${i + 1}: ${word}`}
                            >
                                <Text style={styles.number}>{String(i + 1).padStart(2, "0")}</Text>
                                <Text style={styles.word(card.shown)}>{card.shown ? word : MASK}</Text>
                            </View>
                        ))}
                    </View>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityHint="Release to hide them again"
                        onPressIn={card.hold}
                        onPressOut={card.release}
                        style={({ pressed }) => [styles.hold, pressed && styles.holding]}
                    >
                        <Eye
                            size={17}
                            color={theme.colors.foreground}
                            strokeWidth={1.9}
                        />
                        <Text style={styles.holdLabel}>
                            {card.keepVisible ? "Words are visible" : card.held ? "Showing the words" : "Hold to show the words"}
                        </Text>
                    </Pressable>
                    <Text
                        importantForAccessibility="no"
                        accessibilityElementsHidden
                        style={styles.help}
                    >
                        Release to hide them again
                    </Text>
                </View>
            </Group>
            <Group>
                <SwitchRow
                    label="Keep words visible"
                    value={card.keepVisible}
                    onValueChange={card.setKeepVisible}
                />
            </Group>
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    stack: { gap: 14 },
    card: {
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        rowGap: 6,
    },
    cell: {
        width: "50%",
        minHeight: 26,
        flexDirection: "row",
        alignItems: "baseline",
        gap: 8,
    },
    number: {
        width: 18,
        fontFamily: "Azeret Mono",
        fontSize: 11,
        color: theme.colors.mutedForeground,
    },
    word: (shown: boolean) => ({
        fontFamily: "Azeret Mono",
        fontSize: 14,
        color: shown ? theme.colors.foreground : theme.colors.mutedForeground,
    }),
    hold: {
        marginTop: 14,
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderRadius: 16,
        backgroundColor: theme.colors.surface2,
    },
    holding: { backgroundColor: theme.colors.surface3 },
    holdLabel: {
        fontFamily: "DM Sans",
        fontSize: 15,
        fontWeight: "500",
        color: theme.colors.foreground,
    },
    help: {
        marginTop: 8,
        textAlign: "center",
        fontFamily: "Azeret Mono",
        fontSize: 11,
        letterSpacing: 0.22,
        color: theme.colors.mutedForeground,
    },
}))
