import { personName } from "@pinai/domain/models/identity"
import { router } from "expo-router"
import { BellRing, ChevronLeft, ChevronRight, LogOut, MonitorSmartphone } from "lucide-react-native"
import { Pressable, ScrollView, Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Avatar } from "@/presentation/atoms/avatar/avatar"
import { Motif } from "@/presentation/atoms/motif/motif"
import { signOut } from "@/presentation/_libs/session"
import { useDeviceRoster } from "@/presentation/hooks/use-device-roster"
import { usePushPermission } from "@/presentation/hooks/use-push-permission"
import { statusWords } from "@/presentation/pages/status/status-choices"
import { useAppStore } from "@/store/store"
import { statusColor } from "@/theme/status"

/** Settings: the account, its devices, its notices, and the way out. Its other sections come with their features. */
export function SettingsPage() {
    const { theme } = useUnistyles()
    const user = useAppStore((s) => s.user)
    const status = useAppStore((s) => s.myStatus)
    const waiting = useDeviceRoster().waiting.length
    const notices = usePushPermission()
    if (!user) return null
    const name = personName(user.actor_uri, user.display_name)

    return (
        <View style={styles.screen}>
            <View style={styles.head}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                    onPress={() => router.back()}
                    style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                    <ChevronLeft
                        size={22}
                        color={theme.colors.mutedForeground}
                        strokeWidth={1.9}
                    />
                </Pressable>
                <Text style={styles.eye}>— Settings</Text>
            </View>
            <ScrollView contentContainerStyle={styles.body}>
                <Text
                    accessibilityRole="header"
                    style={styles.title}
                >
                    Adjust the room.
                </Text>

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${name}, ${user.address}, ${statusWords(status)}. Change status`}
                    onPress={() => router.push("/status")}
                    style={styles.card}
                >
                    <Motif
                        variant="field"
                        style={styles.fill}
                    />
                    <Avatar
                        name={name}
                        seed={user.address}
                        imageUrl={user.avatar_url}
                        size="lg"
                        status={status}
                    />
                    <View style={styles.cardText}>
                        <Text
                            numberOfLines={1}
                            style={styles.name}
                        >
                            {name}
                        </Text>
                        <Text
                            numberOfLines={1}
                            style={styles.address}
                        >
                            {user.address}
                        </Text>
                        <View style={styles.statusLine}>
                            <View style={styles.statusDot(status)} />
                            <Text style={styles.statusLabel}>{statusWords(status)}</Text>
                        </View>
                    </View>
                    <ChevronRight
                        size={18}
                        color={theme.colors.mutedForeground}
                        strokeWidth={1.9}
                    />
                </Pressable>

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={waiting > 0 ? `Devices, ${waiting} waiting for you` : "Devices"}
                    onPress={() => router.push("/devices")}
                    style={({ pressed }) => [styles.section, pressed && styles.pressed]}
                >
                    <View style={styles.sectionIcon}>
                        <MonitorSmartphone
                            size={17}
                            color={theme.colors.foreground}
                            strokeWidth={1.9}
                        />
                    </View>
                    <View style={styles.sectionText}>
                        <Text style={styles.sectionLabel}>Devices</Text>
                        <Text style={styles.sectionNote}>Phones and laptops you&apos;re signed in on.</Text>
                        {waiting > 0 && (
                            <View style={styles.statusLine}>
                                <View style={styles.waitingDot} />
                                <Text style={styles.waitingLabel}>{waiting} waiting</Text>
                            </View>
                        )}
                    </View>
                    <ChevronRight
                        size={18}
                        color={theme.colors.mutedForeground}
                        strokeWidth={1.9}
                    />
                </Pressable>

                {notices.permission !== null && (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Notifications, ${notices.permission === "granted" ? "on" : "off"}`}
                        onPress={notices.change}
                        style={({ pressed }) => [styles.section, pressed && styles.pressed]}
                    >
                        <View style={styles.sectionIcon}>
                            <BellRing
                                size={17}
                                color={theme.colors.foreground}
                                strokeWidth={1.9}
                            />
                        </View>
                        <View style={styles.sectionText}>
                            <Text style={styles.sectionLabel}>Notifications</Text>
                            <Text style={styles.sectionNote}>When a device asks to sign in, or to start your history over.</Text>
                        </View>
                        <Text style={styles.sectionValue}>{notices.permission === "granted" ? "On" : "Off"}</Text>
                    </Pressable>
                )}

                <Pressable
                    accessibilityRole="button"
                    onPress={signOut}
                    style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
                >
                    <View style={styles.signOutIcon}>
                        <LogOut
                            size={16}
                            color={theme.colors.dnd}
                            strokeWidth={1.9}
                        />
                    </View>
                    <Text style={styles.signOutLabel}>Sign out</Text>
                </Pressable>
            </ScrollView>
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
        gap: 4,
        paddingTop: 4,
        paddingRight: 10,
    },
    iconButton: {
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 22,
    },
    pressed: {
        backgroundColor: theme.colors.surface2,
    },
    eye: {
        fontFamily: "DM Sans",
        fontSize: 11,
        fontWeight: "500",
        letterSpacing: 0.11,
        color: theme.colors.mutedForeground,
    },
    body: {
        paddingTop: 4,
        paddingHorizontal: 12,
        paddingBottom: rt.insets.bottom + 60,
        gap: 12,
    },
    title: {
        paddingTop: 4,
        paddingHorizontal: 4,
        paddingBottom: 2,
        fontFamily: "Instrument Serif",
        fontSize: 28,
        lineHeight: 30,
        letterSpacing: -0.42,
        color: theme.colors.foreground,
    },
    card: {
        overflow: "hidden",
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: 18,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.chatLine,
        backgroundColor: theme.colors.chatSoft,
    },
    fill: {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
    },
    cardText: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    name: {
        fontFamily: "Instrument Serif",
        fontSize: 20,
        fontWeight: "600",
        color: theme.colors.foreground,
    },
    address: {
        fontFamily: "Azeret Mono",
        fontSize: 10.5,
        letterSpacing: 0.3,
        color: theme.colors.mutedForeground,
    },
    statusLine: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
    },
    statusDot: (status: Parameters<typeof statusColor>[1]) => ({
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: statusColor(theme, status),
    }),
    statusLabel: {
        fontFamily: "DM Sans",
        fontSize: 12,
        color: theme.colors.mutedForeground,
    },
    section: {
        minHeight: 64,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
    },
    sectionIcon: {
        width: 30,
        height: 30,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        backgroundColor: theme.colors.surface2,
    },
    sectionText: { flex: 1, gap: 2 },
    sectionValue: {
        fontFamily: "DM Sans",
        fontSize: 13,
        color: theme.colors.mutedForeground,
    },
    sectionLabel: {
        fontFamily: "DM Sans",
        fontSize: 15,
        fontWeight: "600",
        color: theme.colors.foreground,
    },
    sectionNote: {
        fontFamily: "DM Sans",
        fontSize: 12.5,
        color: theme.colors.mutedForeground,
    },
    waitingDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: theme.colors.idle,
    },
    waitingLabel: {
        fontFamily: "DM Sans",
        fontSize: 12,
        color: theme.colors.idleInk,
    },
    signOut: {
        marginTop: 8,
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.dnd + "4d",
        backgroundColor: theme.colors.surface1,
    },
    signOutIcon: {
        width: 30,
        height: 30,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        backgroundColor: theme.colors.dnd + "24",
    },
    signOutLabel: {
        fontFamily: "Instrument Serif",
        fontSize: 15,
        color: theme.colors.dnd,
    },
}))
