import type { CachedTimelineMessage } from "@pinai/domain/ports/conversation-cache.port"
import { BellOff, ChevronLeft, UserMinus } from "lucide-react-native"
import { useRef } from "react"
import { FlatList, Pressable, Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Avatar } from "@/presentation/atoms/avatar/avatar"
import { Button } from "@/presentation/atoms/button/button"
import { Composer } from "./composer"
import { useConversationViewModel } from "./conversation.viewmodel"
import { MessageRow } from "./message-row"
import { DayLine, NoticeLine } from "./timeline-line"
import type { TimelineRow } from "./timeline-rows"

/** A conversation beside the rail, as the prototype's thread: its head, the timeline from the bottom, the composer. */
export function ConversationPage({ conversationId }: { conversationId: string }) {
    const listRef = useRef<FlatList<TimelineRow<CachedTimelineMessage>>>(null)
    const vm = useConversationViewModel(conversationId, listRef)
    const { theme } = useUnistyles()

    return (
        <View style={styles.screen}>
            <View style={styles.head}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                    onPress={vm.back}
                    style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                    <ChevronLeft
                        size={22}
                        color={theme.colors.mutedForeground}
                        strokeWidth={1.9}
                    />
                </Pressable>
                {vm.name !== "" && (
                    <Avatar
                        name={vm.name}
                        seed={vm.avatarSeed}
                        imageUrl={vm.avatarUrl}
                        tone={vm.isGroup ? "sec" : undefined}
                    />
                )}
                <View style={styles.headText}>
                    <Text
                        accessibilityRole="header"
                        numberOfLines={1}
                        style={styles.name}
                    >
                        {vm.name}
                    </Text>
                    {(vm.muted || vm.headLine !== null) && (
                        <View style={styles.headLine}>
                            {vm.muted && (
                                <BellOff
                                    size={11}
                                    color={theme.colors.mutedForeground}
                                    strokeWidth={1.9}
                                />
                            )}
                            <Text
                                numberOfLines={1}
                                style={styles.fact}
                            >
                                {vm.headLine ?? "Muted"}
                            </Text>
                        </View>
                    )}
                </View>
            </View>

            {vm.rows.length > 0 ? (
                <FlatList
                    ref={listRef}
                    inverted
                    data={vm.rows}
                    keyExtractor={(row) => row.id}
                    renderItem={({ item }) =>
                        item.kind === "message" ? (
                            <MessageRow
                                message={item.message}
                                first={item.first}
                                own={item.message.authorAddress === vm.myAddress}
                                avatarUrl={(item.message.authorAddress && vm.avatars.get(item.message.authorAddress)) || null}
                                isGroup={vm.isGroup}
                                onRetry={vm.retry}
                            />
                        ) : item.kind === "day" ? (
                            <DayLine label={item.label} />
                        ) : (
                            <NoticeLine notice={item.notice} />
                        )
                    }
                    keyboardDismissMode="on-drag"
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.timeline}
                />
            ) : (
                <View style={styles.emptyState}>
                    {vm.loadFailed ? (
                        <>
                            <Text style={styles.quiet}>Couldn't load this conversation.</Text>
                            <Button
                                label="Try again"
                                variant="secondary"
                                onPress={vm.reload}
                            />
                        </>
                    ) : (
                        <Text
                            accessibilityLiveRegion="polite"
                            style={styles.quiet}
                        >
                            {vm.loading ? "Loading messages…" : vm.empty ? "No messages yet." : ""}
                        </Text>
                    )}
                </View>
            )}

            <View style={styles.foot}>
                {vm.loadFailed && vm.rows.length > 0 && (
                    <View style={styles.staleLine}>
                        <Text style={styles.quietSmall}>Couldn't load the newest messages.</Text>
                        <Pressable
                            accessibilityRole="button"
                            onPress={vm.reload}
                            hitSlop={14}
                        >
                            <Text style={styles.link}>Try again</Text>
                        </Pressable>
                    </View>
                )}
                {vm.unavailable ? (
                    <Text style={styles.closed}>This conversation isn't on your list any more.</Text>
                ) : vm.removed ? (
                    <View style={styles.closedRow}>
                        <UserMinus
                            size={16}
                            color={theme.colors.mutedForeground}
                            strokeWidth={1.9}
                        />
                        <Text style={styles.closedText}>You were removed from this group</Text>
                    </View>
                ) : (
                    vm.canWrite && (
                        <Composer
                            name={vm.name}
                            draft={vm.draft}
                            onDraft={vm.setDraft}
                            onSend={vm.send}
                        />
                    )
                )}
            </View>
        </View>
    )
}

const styles = StyleSheet.create((theme, rt) => ({
    screen: {
        flex: 1,
        paddingTop: rt.insets.top,
    },
    head: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingTop: 6,
        paddingRight: 10,
        paddingBottom: 10,
        paddingLeft: 2,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    iconButton: {
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 22,
    },
    pressed: {
        backgroundColor: theme.colors.surface3,
    },
    headText: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    name: {
        fontFamily: "Instrument Serif",
        fontSize: 19,
        fontWeight: "600",
        color: theme.colors.foreground,
    },
    headLine: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
    },
    fact: {
        flexShrink: 1,
        fontFamily: "Azeret Mono",
        fontSize: 10.5,
        letterSpacing: 0.3,
        color: theme.colors.mutedForeground,
    },
    // Drawn from the bottom, flipped: its top padding is the space above the composer.
    timeline: {
        paddingTop: 8,
        paddingBottom: 14,
    },
    emptyState: {
        flex: 1,
        justifyContent: "center",
        gap: 12,
        paddingHorizontal: 24,
    },
    quiet: {
        textAlign: "center",
        fontFamily: "DM Sans",
        fontSize: 13,
        lineHeight: 19,
        color: theme.colors.mutedForeground,
    },
    foot: {
        gap: 8,
        paddingTop: 6,
        paddingHorizontal: 12,
        // The keyboard's height, or the system bar's: the field stays above whichever is there.
        paddingBottom: Math.max(rt.insets.bottom, rt.insets.ime) + 8,
    },
    staleLine: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 8,
    },
    quietSmall: {
        fontFamily: "DM Sans",
        fontSize: 12,
        color: theme.colors.mutedForeground,
    },
    link: {
        fontFamily: "DM Sans",
        fontSize: 12,
        fontWeight: "500",
        color: theme.colors.chat,
    },
    closed: {
        paddingVertical: 14,
        textAlign: "center",
        fontFamily: "DM Sans",
        fontSize: 13,
        color: theme.colors.mutedForeground,
    },
    closedRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.borderStrong,
        backgroundColor: theme.colors.surface2,
    },
    closedText: {
        flexShrink: 1,
        fontFamily: "DM Sans",
        fontSize: 13,
        color: theme.colors.mutedForeground,
    },
}))
