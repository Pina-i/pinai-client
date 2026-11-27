import { ChevronLeft, ChevronRight } from "lucide-react-native"
import { Pressable, ScrollView, Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { router } from "expo-router"
import { Button } from "@/presentation/atoms/button/button"
import { Group, GroupFooter, GroupHeader, GroupRow } from "@/presentation/molecules/group/group"
import { RecentSignInSheet } from "@/presentation/molecules/recent-sign-in-sheet/recent-sign-in-sheet"
import { Sheet } from "@/presentation/molecules/sheet/sheet"
import { tint } from "@/theme/tint"
import { DeviceIcon } from "./device-icon"
import { DeviceRow } from "./device-row"
import { DeviceSheet } from "./device-sheet"
import { useDevicesViewModel } from "./devices.viewmodel"
import { SeatSheet } from "./seat-sheet"

/** Settings › Devices, as the prototype draws it: who waits, this device, the others, the history's words. */
export function DevicesPage() {
    const vm = useDevicesViewModel()
    const { theme } = useUnistyles()

    return (
        <View style={styles.screen}>
            <View style={styles.nav}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back to Settings"
                    onPress={() => router.back()}
                    style={({ pressed }) => [styles.back, pressed && styles.pressed]}
                >
                    <ChevronLeft
                        size={24}
                        color={theme.colors.chat}
                        strokeWidth={1.9}
                    />
                    <Text style={styles.backLabel}>Settings</Text>
                </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.body}>
                <Text
                    accessibilityRole="header"
                    style={styles.title}
                >
                    Devices
                </Text>
                <Text style={styles.sub}>Only approved devices read your conversations and hold your history.</Text>

                {vm.listRefused && (
                    <Text
                        accessibilityLiveRegion="polite"
                        style={styles.refusedList}
                    >
                        Your instance sent a device list naming a device twice. Nothing new is trusted on this device until it stops.
                    </Text>
                )}
                {vm.error && (
                    <Text
                        accessibilityLiveRegion="polite"
                        style={styles.error}
                    >
                        {vm.error}
                    </Text>
                )}

                {vm.loading && <Text style={styles.sub}>Loading devices…</Text>}
                {vm.failed && (
                    <View style={styles.failed}>
                        <Text style={styles.sub}>Could not load devices.</Text>
                        <Button
                            label="Try again"
                            variant="secondary"
                            onPress={vm.reload}
                        />
                    </View>
                )}

                {vm.waiting.length > 0 && (
                    <>
                        <Text
                            accessibilityRole="header"
                            style={[styles.heading, styles.waitingHeading]}
                        >
                            Waiting for you
                        </Text>
                        <View style={styles.waitingGroup}>
                            {vm.waiting.map((device, i) => {
                                const name = device.display_name.trim() || "A device"
                                const refused = vm.isRefused(device)
                                return (
                                    <View
                                        key={device.device_id}
                                        style={i > 0 && styles.divided}
                                    >
                                        <GroupRow
                                            minHeight={68}
                                            accessibilityLabel={refused ? `${name}, reset your history, not yours` : `${name}, ${vm.seatLine(device, "waiting")}`}
                                            onPress={refused ? undefined : () => vm.openSeat(device, "waiting")}
                                        >
                                            <View>
                                                <DeviceIcon
                                                    kind={device.kind}
                                                    color={theme.colors.idle}
                                                    background={tint(theme.colors.idle, 0.14)}
                                                />
                                                <View style={styles.waitingDot} />
                                            </View>
                                            <View style={styles.rowText}>
                                                <Text
                                                    numberOfLines={1}
                                                    style={styles.strongName}
                                                >
                                                    {name}
                                                </Text>
                                                <Text
                                                    numberOfLines={1}
                                                    style={styles.meta}
                                                >
                                                    {refused ? "Reset your history — not yours" : vm.seatLine(device, "waiting")}
                                                </Text>
                                            </View>
                                            {refused ? (
                                                <Pressable
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`Sign out ${name}`}
                                                    disabled={vm.signingOut === device.device_id}
                                                    onPress={() => void vm.signOut(device)}
                                                    hitSlop={8}
                                                >
                                                    <Text style={styles.inlineSignOut}>{vm.signingOut === device.device_id ? "Signing out…" : "Sign out"}</Text>
                                                </Pressable>
                                            ) : (
                                                <ChevronRight
                                                    size={18}
                                                    color={theme.colors.mutedForeground}
                                                    strokeWidth={1.9}
                                                />
                                            )}
                                        </GroupRow>
                                    </View>
                                )
                            })}
                        </View>
                    </>
                )}

                {vm.fromBefore.length > 0 && vm.fromBeforeHeading && (
                    <>
                        <GroupHeader>{vm.fromBeforeHeading}</GroupHeader>
                        <Group>
                            {vm.fromBefore.map((device) => (
                                <GroupRow
                                    key={device.device_id}
                                    minHeight={64}
                                    onPress={() => vm.openSeat(device, "from-before")}
                                >
                                    <DeviceIcon
                                        kind={device.kind}
                                        color={theme.colors.foreground}
                                        background={theme.colors.surface2}
                                    />
                                    <View style={styles.rowText}>
                                        <Text
                                            numberOfLines={1}
                                            style={styles.name}
                                        >
                                            {device.display_name.trim() || "A device"}
                                        </Text>
                                        <Text
                                            numberOfLines={1}
                                            style={styles.meta}
                                        >
                                            {vm.seatLine(device, "from-before")}
                                        </Text>
                                    </View>
                                    <ChevronRight
                                        size={18}
                                        color={theme.colors.mutedForeground}
                                        strokeWidth={1.9}
                                    />
                                </GroupRow>
                            ))}
                        </Group>
                        <GroupFooter>
                            Still have it? Open Pīna&apos;i on it — choose &quot;It was me&quot; if it shows a banner — then type the code it shows
                            here. A device you&apos;ve lost still shows your conversations until you sign it out.
                        </GroupFooter>
                    </>
                )}

                {vm.thisDevice && (
                    <>
                        <GroupHeader>This device</GroupHeader>
                        <Group>
                            <GroupRow minHeight={64}>
                                <DeviceIcon
                                    kind={vm.thisDevice.device.kind}
                                    color={theme.colors.chat}
                                    background={theme.colors.chatSoft}
                                />
                                <View style={styles.rowText}>
                                    <Text
                                        numberOfLines={1}
                                        style={styles.name}
                                    >
                                        {vm.thisDevice.device.display_name.trim() || "This device"}
                                    </Text>
                                    <Text style={styles.meta}>{vm.thisDevice.holdsHistory ? "Active now · holds your history" : "Active now"}</Text>
                                </View>
                            </GroupRow>
                        </Group>
                    </>
                )}

                {vm.others.length > 0 && (
                    <>
                        <GroupHeader>Other devices</GroupHeader>
                        <Group>
                            {vm.others.map((row) => (
                                <DeviceRow
                                    key={row.device.device_id}
                                    device={row.device}
                                    meta={[vm.activity(row.device), row.approvedBy && `approved by ${row.approvedBy}`].filter(Boolean).join(" · ")}
                                    swipeable={row.device.revoked_at === null && !row.revokeWithheld && vm.signingOut === null}
                                    onOpen={() => vm.openDetails(row.device)}
                                    onSignOut={() => void vm.signOut(row.device)}
                                />
                            ))}
                        </Group>
                        <GroupFooter>Swipe left on a device to sign it out, or tap it for details.</GroupFooter>
                    </>
                )}

                {(vm.passphraseHeld || vm.offersRestore) && (
                    <>
                        <GroupHeader>History</GroupHeader>
                        <Group>
                            {vm.passphraseHeld && (
                                <GroupRow
                                    onPress={vm.openWords}
                                    accessibilityLabel={`Your 24 words, held by ${vm.heldBy} ${vm.heldBy === 1 ? "device" : "devices"}`}
                                >
                                    <Text style={[styles.name, styles.grow]}>Your 24 words</Text>
                                    <Text style={styles.meta}>
                                        held by {vm.heldBy} {vm.heldBy === 1 ? "device" : "devices"}
                                    </Text>
                                    <ChevronRight
                                        size={18}
                                        color={theme.colors.mutedForeground}
                                        strokeWidth={1.9}
                                    />
                                </GroupRow>
                            )}
                            {vm.offersRestore && (
                                <GroupRow onPress={vm.openRestore}>
                                    <Text style={[styles.name, styles.grow, styles.link]}>Restore history from words</Text>
                                </GroupRow>
                            )}
                        </Group>
                    </>
                )}
            </ScrollView>

            <Sheet
                visible={vm.seat !== null}
                label={vm.seat ? `Approve ${vm.seat.device.display_name.trim() || "a device"}` : "Approve"}
                onClose={vm.signingOut ? undefined : vm.closeSeat}
            >
                {vm.seat && (
                    <SeatSheet
                        device={vm.seat.device}
                        kind={vm.seat.kind}
                        answering={vm.answering}
                        seats={vm.seats}
                        signingOut={vm.signingOut === vm.seat.device.device_id}
                        onNotMine={() => {
                            const device = vm.seat?.device
                            if (device) void vm.signOut(device).then((done) => done && vm.closeSeat())
                        }}
                        onClose={vm.closeSeat}
                    />
                )}
            </Sheet>
            <Sheet
                visible={vm.details !== null}
                label="Device details"
                onClose={vm.signingOut ? undefined : vm.closeDetails}
            >
                {vm.details && (
                    <DeviceSheet
                        row={vm.details}
                        activity={vm.activity(vm.details.device)}
                        signingOut={vm.signingOut === vm.details.device.device_id}
                        error={vm.error}
                        onSignOut={() => {
                            const device = vm.details?.device
                            if (device) void vm.signOut(device).then((done) => done && vm.closeDetails())
                        }}
                    />
                )}
            </Sheet>
            <RecentSignInSheet recentSignIn={vm.recentSignIn} />
        </View>
    )
}

const styles = StyleSheet.create((theme, rt) => ({
    screen: { flex: 1, paddingTop: rt.insets.top },
    nav: { paddingTop: 4, paddingHorizontal: 6 },
    back: {
        alignSelf: "flex-start",
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        paddingRight: 10,
        borderRadius: 22,
    },
    pressed: { backgroundColor: theme.colors.surface2 },
    backLabel: {
        fontFamily: "DM Sans",
        fontSize: 16,
        color: theme.colors.chat,
    },
    body: {
        paddingHorizontal: 16,
        paddingBottom: rt.insets.bottom + 60,
    },
    title: {
        marginTop: 6,
        fontFamily: "Instrument Serif",
        fontSize: 34,
        lineHeight: 38,
        color: theme.colors.foreground,
    },
    sub: {
        marginTop: 6,
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.mutedForeground,
    },
    refusedList: {
        marginTop: 14,
        fontFamily: "DM Sans",
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.idleInk,
    },
    error: {
        marginTop: 14,
        fontFamily: "DM Sans",
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.dndInk,
    },
    failed: { marginTop: 14, gap: 10 },
    heading: {
        marginTop: 22,
        marginBottom: 8,
        marginHorizontal: 16,
        fontFamily: "DM Sans",
        fontSize: 12.5,
    },
    waitingHeading: { color: theme.colors.idleInk },
    waitingGroup: {
        overflow: "hidden",
        borderRadius: 16,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: tint(theme.colors.idle, 0.55),
        backgroundColor: theme.colors.surface1,
    },
    divided: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    waitingDot: {
        position: "absolute",
        top: -3,
        right: -3,
        width: 9,
        height: 9,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: theme.colors.background,
        backgroundColor: theme.colors.idle,
    },
    rowText: { flex: 1, minWidth: 0, gap: 2 },
    name: {
        fontFamily: "DM Sans",
        fontSize: 16,
        color: theme.colors.foreground,
    },
    strongName: {
        fontFamily: "DM Sans",
        fontSize: 16,
        fontWeight: "600",
        color: theme.colors.foreground,
    },
    meta: {
        fontFamily: "DM Sans",
        fontSize: 12.5,
        color: theme.colors.mutedForeground,
    },
    grow: { flex: 1 },
    link: { color: theme.colors.chat },
    inlineSignOut: {
        fontFamily: "DM Sans",
        fontSize: 14,
        fontWeight: "600",
        color: theme.colors.dndInk,
    },
}))
