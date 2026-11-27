import { deviceShortId } from "@pinai/crypto/device-short-id"
import { ONLY_APPROVED_REVOKES, type PaneRow, type RosterDevice } from "@pinai/domain/models/device-roster"
import { Text, View } from "react-native"
import { StyleSheet } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { dayLabel } from "@/presentation/_libs/day-label"

interface DeviceSheetProps {
    row: PaneRow<RosterDevice>
    activity: string | null
    signingOut: boolean
    error: string | null
    onSignOut: () => void
}

/** A device's details, its sign-out at the bottom. Its parent `Sheet` holds it. */
export function DeviceSheet({ row, activity, signingOut, error, onSignOut }: DeviceSheetProps) {
    const { device } = row
    const name = device.display_name.trim() || "A device"
    const facts: [string, string][] = [
        ["Last active", activity ?? "—"],
        ["Approved by", row.approvedBy ?? "—"],
        ["Paired", dayLabel(device.paired_at)],
        ["Short id", deviceShortId(device.device_id)],
    ]
    if (device.chosen_name) facts.splice(1, 0, ["Its own name", device.automatic_name])
    return (
        <View style={styles.content}>
            <Text
                accessibilityRole="header"
                style={styles.title}
            >
                {name}
            </Text>
            <View style={styles.facts}>
                {facts.map(([label, value], i) => (
                    <View
                        key={label}
                        style={[styles.fact, i > 0 && styles.divided]}
                    >
                        <Text style={styles.label}>{label}</Text>
                        <Text
                            numberOfLines={1}
                            style={styles.value}
                        >
                            {value}
                        </Text>
                    </View>
                ))}
            </View>
            {error && (
                <Text
                    accessibilityLiveRegion="polite"
                    style={styles.error}
                >
                    {error}
                </Text>
            )}
            {device.revoked_at !== null ? null : row.revokeWithheld ? (
                <Text style={styles.note}>{ONLY_APPROVED_REVOKES}.</Text>
            ) : (
                <Button
                    label={signingOut ? "Signing out…" : "Sign out this device"}
                    variant="erase-filled"
                    disabled={signingOut}
                    onPress={onSignOut}
                />
            )}
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    content: { gap: 14 },
    title: {
        marginHorizontal: 4,
        fontFamily: "DM Sans",
        fontSize: 17,
        fontWeight: "600",
        color: theme.colors.foreground,
    },
    facts: {
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
    },
    fact: {
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
    },
    divided: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    label: {
        fontFamily: "DM Sans",
        fontSize: 15,
        color: theme.colors.foreground,
    },
    value: {
        flex: 1,
        textAlign: "right",
        fontFamily: "DM Sans",
        fontSize: 14,
        color: theme.colors.mutedForeground,
    },
    note: {
        marginHorizontal: 4,
        fontFamily: "DM Sans",
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.mutedForeground,
    },
    error: {
        marginHorizontal: 4,
        fontFamily: "DM Sans",
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.dndInk,
    },
}))
