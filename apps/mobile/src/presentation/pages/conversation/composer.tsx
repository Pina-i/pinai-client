import { Send } from "lucide-react-native"
import { Pressable, TextInput, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"

interface ComposerProps {
    name: string
    draft: string
    onDraft: (text: string) => void
    onSend: () => void
}

/** The prototype's composer, text only for now: the field and Send. */
export function Composer({ name, draft, onDraft, onSend }: ComposerProps) {
    const { theme } = useUnistyles()
    const empty = draft.trim() === ""
    const label = name ? `Message ${name}` : "Message"

    return (
        <View style={styles.composer}>
            <TextInput
                accessibilityLabel={label}
                placeholder={label}
                placeholderTextColor={theme.colors.mutedForeground}
                value={draft}
                onChangeText={onDraft}
                multiline
                style={styles.field}
            />
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                accessibilityState={{ disabled: empty }}
                disabled={empty}
                onPress={onSend}
                style={({ pressed }) => [styles.send, empty && styles.sendEmpty, pressed && styles.pressed]}
            >
                <Send
                    size={16}
                    color={empty ? theme.colors.mutedForeground : theme.colors.actionForeground}
                    strokeWidth={1.9}
                />
            </Pressable>
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    composer: {
        minHeight: 52,
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 6,
        paddingVertical: 4,
        paddingLeft: 14,
        paddingRight: 4,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
    },
    field: {
        flex: 1,
        minWidth: 0,
        maxHeight: 132,
        minHeight: 44,
        paddingVertical: 11,
        paddingHorizontal: 4,
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.foreground,
    },
    send: {
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 22,
        backgroundColor: theme.colors.action,
    },
    sendEmpty: {
        backgroundColor: theme.colors.surface3,
    },
    pressed: {
        transform: [{ scale: 0.96 }],
    },
}))
