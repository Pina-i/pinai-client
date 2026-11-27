import { personName } from "@pinai/domain/models/identity"
import type { UserStatus } from "@pinai/domain/models/presence"
import { router } from "expo-router"
import { Settings } from "lucide-react-native"
import { FlatList, Pressable, Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Avatar } from "@/presentation/atoms/avatar/avatar"
import { Button } from "@/presentation/atoms/button/button"
import { Motif } from "@/presentation/atoms/motif/motif"
import { HistoryResetBanner } from "@/presentation/organisms/history-reset-banner/history-reset-banner"
import { statusWords } from "@/presentation/pages/status/status-choices"
import { useAppStore } from "@/store/store"
import { statusColor } from "@/theme/status"
import { ConversationRow } from "./conversation-row"
import { useHomeViewModel } from "./home.viewmodel"

/** Reach's home: the panel beside the rail, the conversations in it, the user at its foot. */
export function HomePage() {
    const { theme } = useUnistyles()
    const vm = useHomeViewModel()
    const user = useAppStore((s) => s.user)
    const status = useAppStore((s) => s.myStatus)
    if (!user) return null
    const name = personName(user.actor_uri, user.display_name)

    return (
        <View style={styles.panel}>
            <Motif
                variant="field"
                style={styles.fill}
            />
            <HistoryResetBanner />
            <Text
                accessibilityRole="header"
                style={styles.welcome}
            >
                — Welcome back, {name}
            </Text>
            <FlatList
                data={vm.conversations ?? []}
                keyExtractor={(item) => item.row.id}
                renderItem={({ item }) => (
                    <ConversationRow
                        row={item.row}
                        summary={item.summary}
                        onOpen={vm.open}
                    />
                )}
                ListHeaderComponent={
                    <Text
                        accessibilityRole="header"
                        style={styles.eye}
                    >
                        Direct messages
                    </Text>
                }
                ListEmptyComponent={
                    vm.failed ? (
                        <View style={styles.failed}>
                            <Text style={styles.waiting}>Couldn't load your conversations.</Text>
                            <Button
                                label="Try again"
                                variant="secondary"
                                onPress={vm.retry}
                            />
                        </View>
                    ) : (
                        <Text
                            accessibilityLiveRegion="polite"
                            style={styles.waiting}
                        >
                            {vm.loading ? "Loading your conversations…" : "No conversations yet. Start one on the web or the desktop app."}
                        </Text>
                    )
                }
                contentContainerStyle={styles.list}
            />

            <View style={styles.footer}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Change status, ${statusWords(status)}`}
                    onPress={() => router.push("/status")}
                    style={({ pressed }) => [styles.me, pressed && styles.pressed]}
                >
                    <Avatar
                        name={name}
                        seed={user.address}
                        imageUrl={user.avatar_url}
                    />
                    <View style={styles.meText}>
                        <Text
                            numberOfLines={1}
                            style={styles.meName}
                        >
                            {name}
                        </Text>
                        <View style={styles.statusLine}>
                            <View style={styles.statusDot(status)} />
                            <Text style={styles.statusLabel}>{statusWords(status).toLowerCase()}</Text>
                        </View>
                    </View>
                </Pressable>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Settings"
                    onPress={() => router.push("/settings")}
                    style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                    <Settings
                        size={20}
                        color={theme.colors.mutedForeground}
                        strokeWidth={1.9}
                    />
                </Pressable>
            </View>
        </View>
    )
}

const styles = StyleSheet.create((theme, rt) => ({
    panel: {
        flex: 1,
        overflow: "hidden",
        marginTop: rt.insets.top + 6,
        marginRight: 10,
        marginBottom: rt.insets.bottom + 10,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
    },
    fill: {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
    },
    welcome: {
        paddingTop: 18,
        paddingHorizontal: 18,
        paddingBottom: 10,
        fontFamily: "DM Sans",
        fontSize: 11,
        fontWeight: "500",
        letterSpacing: 0.11,
        color: theme.colors.mutedForeground,
    },
    list: {
        paddingHorizontal: 8,
        paddingBottom: 12,
    },
    eye: {
        marginTop: 4,
        marginBottom: 4,
        marginLeft: 14,
        fontFamily: "DM Sans",
        fontSize: 11,
        fontWeight: "500",
        letterSpacing: 0.11,
        color: theme.colors.mutedForeground,
    },
    waiting: {
        marginTop: 6,
        marginHorizontal: 14,
        fontFamily: "DM Sans",
        fontSize: 13,
        lineHeight: 19,
        color: theme.colors.mutedForeground,
    },
    failed: {
        gap: 12,
        paddingHorizontal: 6,
    },
    footer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingVertical: 6,
        paddingLeft: 6,
        paddingRight: 8,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
    },
    me: {
        flex: 1,
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 6,
        borderRadius: 999,
    },
    meText: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    meName: {
        fontFamily: "DM Sans",
        fontSize: 13,
        fontWeight: "700",
        color: theme.colors.foreground,
    },
    statusLine: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
    },
    statusDot: (status: UserStatus) => ({
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: statusColor(theme, status),
    }),
    statusLabel: {
        fontFamily: "Azeret Mono",
        fontSize: 10.5,
        letterSpacing: 0.3,
        color: theme.colors.mutedForeground,
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
}))
