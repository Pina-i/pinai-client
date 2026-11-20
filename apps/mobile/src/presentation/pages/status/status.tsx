import { personName } from "@pinai/domain/models/identity"
import type { UserStatus } from "@pinai/domain/models/presence"
import { setPresenceUseCase } from "@pinai/domain/usecases/presence/set-presence.usecase"
import { router } from "expo-router"
import { Check } from "lucide-react-native"
import { Pressable, Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { getWsPort } from "@/ioc"
import { Avatar } from "@/presentation/atoms/avatar/avatar"
import { useAppStore } from "@/store/store"
import { statusColor } from "@/theme/status"
import { STATUS_CHOICES } from "./status-choices"

/** "Your status": who you are, and how your friends see you. */
export function StatusSheet() {
    const { theme } = useUnistyles()
    const user = useAppStore((s) => s.user)
    const current = useAppStore((s) => s.myStatus)
    if (!user) return null
    const name = personName(user.actor_uri, user.display_name)

    function pick(status: UserStatus) {
        useAppStore.getState().setMyStatus(status)
        setPresenceUseCase(getWsPort(), status)
        router.back()
    }

    return (
        <View style={styles.sheet}>
            <View
                importantForAccessibility="no-hide-descendants"
                style={styles.grabber}
            />
            <View style={styles.who}>
                <Avatar
                    name={name}
                    seed={user.address}
                    imageUrl={user.avatar_url}
                    size="lg"
                    status={current}
                />
                <View style={styles.whoText}>
                    <Text
                        accessibilityRole="header"
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
                </View>
            </View>
            <Text
                accessibilityRole="header"
                style={styles.eye}
            >
                Status
            </Text>
            <View accessibilityRole="radiogroup">
                {STATUS_CHOICES.map((choice) => {
                    const on = choice.status === current
                    return (
                        <Pressable
                            key={choice.status}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: on }}
                            onPress={() => pick(choice.status)}
                            style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.pressed]}
                        >
                            <View style={styles.dot(choice.status)} />
                            <View style={styles.rowText}>
                                <Text style={styles.label}>{choice.label}</Text>
                                <Text style={styles.note}>{choice.note}</Text>
                            </View>
                            {on && (
                                <Check
                                    size={18}
                                    color={theme.colors.chat}
                                    strokeWidth={2}
                                />
                            )}
                        </Pressable>
                    )
                })}
            </View>
        </View>
    )
}

const styles = StyleSheet.create((theme, rt) => ({
    sheet: {
        flex: 1,
        paddingHorizontal: 10,
        paddingBottom: rt.insets.bottom + 24,
        backgroundColor: theme.colors.popover,
    },
    grabber: {
        alignSelf: "center",
        width: 40,
        height: 4,
        borderRadius: 2,
        marginTop: 10,
        marginBottom: 6,
        backgroundColor: theme.colors.borderStrong,
    },
    who: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingTop: 6,
        paddingHorizontal: 14,
        paddingBottom: 14,
    },
    whoText: {
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
    eye: {
        marginTop: 6,
        marginBottom: 4,
        marginLeft: 14,
        fontFamily: "DM Sans",
        fontSize: 11,
        fontWeight: "500",
        letterSpacing: 0.11,
        color: theme.colors.mutedForeground,
    },
    row: {
        minHeight: 52,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
    },
    rowOn: {
        backgroundColor: theme.colors.chatSoft,
    },
    pressed: {
        backgroundColor: theme.colors.surface2,
    },
    dot: (status: UserStatus) => ({
        width: 12,
        height: 12,
        marginHorizontal: 6,
        borderRadius: 6,
        backgroundColor: statusColor(theme, status),
    }),
    rowText: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    label: {
        fontFamily: "DM Sans",
        fontSize: 14.5,
        color: theme.colors.foreground,
    },
    note: {
        fontFamily: "DM Sans",
        fontSize: 12,
        color: theme.colors.mutedForeground,
    },
}))
