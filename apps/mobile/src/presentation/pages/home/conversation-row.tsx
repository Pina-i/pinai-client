import type { ConversationRow as Row } from "@pinai/domain/models/conversation-list"
import type { DmConversationSummary } from "@pinai/domain/models/dm"
import { BellOff } from "lucide-react-native"
import { memo } from "react"
import { Pressable, Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Avatar } from "@/presentation/atoms/avatar/avatar"
import { useConversationRowViewModel } from "./conversation-row.viewmodel"

interface ConversationRowProps {
    row: Row
    summary: DmConversationSummary
    onOpen: (id: string) => void
}

/** A conversation in "Direct messages", as the prototype draws it: avatar or group, name, its line, time and count. */
export const ConversationRow = memo(function ConversationRow({ row, summary, onOpen }: ConversationRowProps) {
    const vm = useConversationRowViewModel(row, summary)
    const { theme } = useUnistyles()

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={vm.accessibilityLabel}
            onPress={() => onOpen(row.id)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed, vm.removed && styles.removed]}
        >
            <Avatar
                name={vm.name}
                seed={row.address}
                imageUrl={vm.avatarUrl}
                tone={vm.isGroup ? "sec" : undefined}
            />
            <View style={styles.text}>
                <Text
                    numberOfLines={1}
                    style={styles.name}
                >
                    {vm.name}
                </Text>
                {vm.line !== null && (
                    <View style={styles.lineRow}>
                        {vm.showsMuted && (
                            <BellOff
                                size={11}
                                color={theme.colors.mutedForeground}
                                strokeWidth={1.9}
                            />
                        )}
                        <Text
                            numberOfLines={1}
                            style={vm.lineIsFact ? styles.fact : styles.preview}
                        >
                            {vm.line}
                        </Text>
                    </View>
                )}
            </View>
            {(vm.time !== null || vm.unread > 0) && (
                <View style={styles.end}>
                    {vm.time !== null && <Text style={styles.time}>{vm.time}</Text>}
                    {vm.unread > 0 && <Text style={vm.muted ? styles.mutedPill : styles.pill}>{vm.unread}</Text>}
                </View>
            )}
        </Pressable>
    )
})

const styles = StyleSheet.create((theme) => ({
    row: {
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
    },
    pressed: {
        backgroundColor: theme.colors.surface2,
    },
    removed: {
        opacity: 0.6,
    },
    text: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    name: {
        fontFamily: "Instrument Serif",
        fontSize: 15,
        fontWeight: "600",
        color: theme.colors.foreground,
    },
    lineRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
    },
    preview: {
        flexShrink: 1,
        fontFamily: "DM Sans",
        fontSize: 12,
        color: theme.colors.mutedForeground,
    },
    fact: {
        flexShrink: 1,
        fontFamily: "Azeret Mono",
        fontSize: 10.5,
        letterSpacing: 0.3,
        color: theme.colors.mutedForeground,
    },
    end: {
        alignItems: "flex-end",
        gap: 4,
    },
    time: {
        fontFamily: "Azeret Mono",
        fontSize: 10,
        letterSpacing: 0.3,
        color: theme.colors.mutedForeground,
    },
    pill: {
        overflow: "hidden",
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 999,
        fontFamily: "Azeret Mono",
        fontSize: 9.5,
        fontWeight: "500",
        color: theme.colors.chatForeground,
        backgroundColor: theme.colors.chat,
    },
    mutedPill: {
        overflow: "hidden",
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 999,
        fontFamily: "Azeret Mono",
        fontSize: 9.5,
        fontWeight: "500",
        color: theme.colors.mutedForeground,
        backgroundColor: theme.colors.surface3,
    },
}))
