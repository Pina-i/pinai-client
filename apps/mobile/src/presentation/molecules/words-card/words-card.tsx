import { Check, Copy, Eye, EyeOff } from "lucide-react-native"
import { Pressable, Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Group } from "@/presentation/molecules/group/group"
import { useWordsCard } from "./words-card.viewmodel"

// Hidden, the cells hold dots, never the words: Android draws the blur from 12 on only.
const mask = (i: number) => "•".repeat(5 + ((i * 3) % 4))

/** The account's 24 words, numbered in two columns read in rows: blurred until shown, copied hidden or not. */
export function WordsCard({ words, onSeen }: { words: string[]; onSeen?: () => void }) {
    const card = useWordsCard(words, onSeen)
    const { theme } = useUnistyles()
    const ShowIcon = card.shown ? EyeOff : Eye
    const CopyIcon = card.copied ? Check : Copy
    const copyColor = card.copied ? theme.colors.online : theme.colors.foreground

    return (
        <Group>
            <View style={styles.card}>
                <View
                    style={[styles.grid, !card.shown && styles.blurred]}
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
                            <Text style={styles.number}>{i + 1}</Text>
                            <Text style={styles.word}>{card.shown ? word : mask(i)}</Text>
                        </View>
                    ))}
                </View>
                <View style={styles.buttons}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: card.shown }}
                        onPress={card.toggle}
                        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                    >
                        <ShowIcon
                            size={17}
                            color={theme.colors.foreground}
                            strokeWidth={1.9}
                        />
                        <Text style={styles.buttonLabel}>{card.shown ? "Hide words" : "Show words"}</Text>
                    </Pressable>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Copy your 24 words"
                        onPress={card.copy}
                        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                    >
                        <CopyIcon
                            size={17}
                            color={copyColor}
                            strokeWidth={card.copied ? 2.2 : 1.9}
                        />
                        <Text style={[styles.buttonLabel, { color: copyColor }]}>{card.copied ? "Copied" : "Copy words"}</Text>
                    </Pressable>
                </View>
                <Text
                    accessibilityLiveRegion="polite"
                    style={styles.note}
                >
                    {card.copied ? "In your clipboard — paste it somewhere safe, then clear it." : "Copy works even while the words are hidden."}
                </Text>
            </View>
        </Group>
    )
}

const styles = StyleSheet.create((theme) => ({
    card: { padding: 16 },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        rowGap: 6,
    },
    blurred: { filter: [{ blur: 7 }] },
    cell: {
        width: "50%",
        minHeight: 26,
        flexDirection: "row",
        alignItems: "baseline",
        gap: 8,
        paddingRight: 9,
    },
    number: {
        width: 18,
        fontFamily: "Azeret Mono",
        fontSize: 11,
        color: theme.colors.mutedForeground,
    },
    word: {
        fontFamily: "Azeret Mono",
        fontSize: 14,
        color: theme.colors.foreground,
    },
    buttons: {
        flexDirection: "row",
        gap: 10,
        marginTop: 16,
    },
    button: {
        flex: 1,
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderRadius: 16,
        backgroundColor: theme.colors.surface2,
    },
    pressed: { backgroundColor: theme.colors.surface3 },
    buttonLabel: {
        fontFamily: "DM Sans",
        fontSize: 15,
        fontWeight: "700",
        color: theme.colors.foreground,
    },
    note: {
        marginTop: 10,
        textAlign: "center",
        fontFamily: "Azeret Mono",
        fontSize: 11,
        letterSpacing: 0.22,
        color: theme.colors.mutedForeground,
    },
}))
