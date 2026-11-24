import { Pressable, Text, TextInput, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { Group } from "@/presentation/molecules/group/group"
import { useWordsWayViewModel } from "./words-way.viewmodel"

export interface WordsWayProps {
    /** The way on screen: screenshots are blocked only then. */
    active: boolean
    setUp: () => Promise<void> | null
    onTyping: (busy: boolean) => void
    onIn: () => void
}

/** "24 words": the account's words, typed or pasted into one field. */
export function WordsWay(props: WordsWayProps) {
    const vm = useWordsWayViewModel(props)
    const { theme } = useUnistyles()

    return (
        <View accessibilityLabel="Type your 24 words">
            <Group>
                <TextInput
                    accessibilityLabel="Your 24 words"
                    placeholder="Paste or type your 24 words, separated by spaces"
                    placeholderTextColor={theme.colors.mutedForeground}
                    value={vm.text}
                    onChangeText={vm.setText}
                    editable={!vm.checking}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    spellCheck={false}
                    importantForAutofill="no"
                    style={styles.field}
                />
                <View style={styles.foot}>
                    <Text style={styles.count(vm.complete)}>{vm.count}</Text>
                    <Pressable
                        accessibilityRole="button"
                        disabled={vm.checking}
                        onPress={vm.paste}
                        style={styles.paste}
                    >
                        <Text style={styles.pasteLabel}>Paste</Text>
                    </Pressable>
                </View>
            </Group>
            {vm.refusal ? (
                <Text
                    accessibilityLiveRegion="polite"
                    style={styles.refusal}
                >
                    {vm.refusal}
                </Text>
            ) : (
                vm.misspelt && (
                    <Text
                        accessibilityLiveRegion="polite"
                        style={styles.misspelt}
                    >
                        &ldquo;{vm.misspelt}&rdquo; isn&apos;t one of the words — check its spelling.
                    </Text>
                )
            )}
            <Text style={styles.help}>The words you saved when you created your account. Order matters; capitals don&apos;t.</Text>
            <View style={styles.action}>
                <Button
                    label={vm.checking ? "Checking your words…" : "Bring my history"}
                    disabled={!vm.complete || vm.checking}
                    onPress={vm.bring}
                />
            </View>
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    field: {
        minHeight: 6 * 24 + 24,
        paddingTop: 12,
        paddingBottom: 12,
        paddingHorizontal: 16,
        fontFamily: "Azeret Mono",
        fontSize: 15,
        lineHeight: 24,
        color: theme.colors.foreground,
    },
    foot: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 4,
        paddingBottom: 4,
        paddingHorizontal: 16,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
    },
    count: (complete: boolean) => ({
        fontFamily: "Azeret Mono",
        fontSize: 11,
        letterSpacing: 0.22,
        color: complete ? theme.colors.onlineInk : theme.colors.mutedForeground,
    }),
    paste: {
        minHeight: 44,
        justifyContent: "center",
        paddingHorizontal: 4,
    },
    pasteLabel: {
        fontFamily: "DM Sans",
        fontSize: 14,
        color: theme.colors.chat,
    },
    refusal: {
        marginTop: 8,
        marginHorizontal: 16,
        fontFamily: "DM Sans",
        fontSize: 12.5,
        lineHeight: 18,
        color: theme.colors.dndInk,
    },
    misspelt: {
        marginTop: 8,
        marginHorizontal: 16,
        fontFamily: "DM Sans",
        fontSize: 12.5,
        lineHeight: 18,
        color: theme.colors.idleInk,
    },
    help: {
        marginTop: 8,
        marginHorizontal: 16,
        fontFamily: "DM Sans",
        fontSize: 12.5,
        lineHeight: 18,
        color: theme.colors.mutedForeground,
    },
    action: { marginTop: 18 },
}))
