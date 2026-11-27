import type { LucideIcon } from "lucide-react-native"
import { Check, LogOut, ShieldAlert, ShieldX } from "lucide-react-native"
import { ActivityIndicator, Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { NumberPad } from "@/presentation/molecules/number-pad/number-pad"
import { RecentSignInSheet } from "@/presentation/molecules/recent-sign-in-sheet/recent-sign-in-sheet"
import { Sheet } from "@/presentation/molecules/sheet/sheet"
import { TypedCode } from "@/presentation/molecules/typed-code/typed-code"
import { tint } from "@/theme/tint"
import { type ApprovalDoorViewModel, useApprovalDoorViewModel } from "./approval-door.viewmodel"

const TITLES = { ask: "Is this you?", working: "Is this you?", approved: "Approved", failed: "Not approved", "signed-out": "Signed it out" } as const

/** "Is this you?": another device asks to be approved, or arrived and is waited for. Over every screen of the app. */
export function ApprovalDoor() {
    const vm = useApprovalDoorViewModel()
    return (
        <>
            <Sheet
                visible={vm.visible}
                label={TITLES[vm.stage]}
                onClose={vm.onDismiss}
            >
                {(vm.stage === "ask" || vm.stage === "working") && <Ask vm={vm} />}
                {vm.stage === "approved" && <Approved vm={vm} />}
                {vm.stage === "failed" && <Failed vm={vm} />}
                {vm.stage === "signed-out" && <SignedOut vm={vm} />}
            </Sheet>
            <RecentSignInSheet recentSignIn={vm.recentSignIn} />
        </>
    )
}

function Ask({ vm }: { vm: ApprovalDoorViewModel }) {
    const { theme } = useUnistyles()
    const working = vm.stage === "working"
    return (
        <View style={styles.ask}>
            <View style={styles.head}>
                <Tile
                    icon={ShieldAlert}
                    color={theme.colors.idle}
                />
                <View style={styles.headText}>
                    <Text
                        accessibilityRole="header"
                        style={styles.title}
                    >
                        Is this you?
                    </Text>
                    <Text
                        numberOfLines={1}
                        style={styles.sub}
                    >
                        {vm.since ? `${vm.device} · ${vm.since}` : vm.device}
                    </Text>
                </View>
            </View>

            {vm.waiting ? (
                <Text style={styles.body}>
                    Waiting for {vm.device} to show a code: on it, choose to approve it from another device. The code to type comes
                    here.
                </Text>
            ) : working ? (
                <View style={styles.working}>
                    <ActivityIndicator color={theme.colors.mutedForeground} />
                    <Text
                        accessibilityLiveRegion="polite"
                        style={styles.body}
                    >
                        Checking the code with {vm.device}…
                    </Text>
                </View>
            ) : (
                <>
                    <Text style={styles.body}>Type the code that device shows. Approving gives it your conversations and history.</Text>
                    {vm.wrongCodeBefore && <Text style={styles.note}>That code didn&apos;t match — type the new one it shows.</Text>}
                    <TypedCode code={vm.code} />
                    <NumberPad
                        disabled={vm.signingOut}
                        onDigit={(digit) => vm.setCode(vm.code + digit)}
                        onDelete={() => vm.setCode(vm.code.slice(0, -1))}
                    />
                </>
            )}

            {vm.error && (
                <Text
                    accessibilityLiveRegion="polite"
                    style={styles.error}
                >
                    {vm.error}
                </Text>
            )}

            {working ? (
                <Button
                    label="Cancel"
                    variant="secondary"
                    onPress={vm.onCancel}
                />
            ) : (
                <View style={styles.row}>
                    <View style={styles.notMe}>
                        <Button
                            label={vm.signingOut ? "Signing out…" : "Not me"}
                            variant="erase"
                            disabled={vm.signingOut}
                            onPress={vm.onNotMe}
                        />
                    </View>
                    <View style={styles.approve}>
                        {vm.waiting ? (
                            <Button
                                label="Close"
                                variant="secondary"
                                disabled={vm.signingOut}
                                onPress={vm.onClose}
                            />
                        ) : (
                            <Button
                                label="Approve"
                                disabled={!vm.canApprove}
                                onPress={vm.onApprove}
                            />
                        )}
                    </View>
                </View>
            )}
        </View>
    )
}

function Approved({ vm }: { vm: ApprovalDoorViewModel }) {
    const { theme } = useUnistyles()
    return (
        <View style={styles.outcome}>
            <Tile
                icon={Check}
                color={theme.colors.online}
                large
            />
            <Text
                accessibilityRole="header"
                style={styles.outcomeTitle}
            >
                {vm.device} is in
            </Text>
            <Text style={styles.outcomeBody}>Your history is on its way. Sign it out any time in Settings › Devices.</Text>
            <View style={styles.outcomeActions}>
                <Button
                    label="Done"
                    variant="secondary"
                    onPress={vm.onClose}
                />
            </View>
        </View>
    )
}

function Failed({ vm }: { vm: ApprovalDoorViewModel }) {
    const { theme } = useUnistyles()
    return (
        <View style={styles.outcome}>
            <Tile
                icon={ShieldX}
                color={theme.colors.dnd}
                large
            />
            <Text
                accessibilityRole="header"
                style={styles.outcomeTitle}
            >
                Not approved
            </Text>
            <Text style={styles.outcomeBody}>{vm.failure}</Text>
            <View style={styles.outcomeActions}>
                <Button
                    label="Close"
                    variant="secondary"
                    onPress={vm.onClose}
                />
            </View>
        </View>
    )
}

function SignedOut({ vm }: { vm: ApprovalDoorViewModel }) {
    const { theme } = useUnistyles()
    return (
        <View style={styles.outcome}>
            <Tile
                icon={LogOut}
                color={theme.colors.dnd}
                large
            />
            <Text
                accessibilityRole="header"
                style={styles.outcomeTitle}
            >
                Signed it out
            </Text>
            <Text style={styles.outcomeBody}>It can&apos;t read anything of yours. Someone may know your password — change it now.</Text>
            {vm.adviceShown && (
                <Text
                    accessibilityLiveRegion="polite"
                    style={styles.advice}
                >
                    {vm.advice}
                </Text>
            )}
            <View style={styles.outcomeActions}>
                {!vm.adviceShown && (
                    <Button
                        label="Change password"
                        onPress={vm.showAdvice}
                    />
                )}
                <Button
                    label={vm.adviceShown ? "Done" : "Later"}
                    variant="quiet"
                    onPress={vm.onDone}
                />
            </View>
        </View>
    )
}

function Tile({ icon: Icon, color, large }: { icon: LucideIcon; color: string; large?: boolean }) {
    return (
        <View style={styles.tile(tint(color, 0.16), large === true)}>
            <Icon
                size={large ? 30 : 20}
                color={color}
                strokeWidth={1.9}
            />
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    ask: { gap: 14 },
    head: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 4,
    },
    headText: { flex: 1 },
    title: {
        fontFamily: "DM Sans",
        fontSize: 17,
        fontWeight: "600",
        color: theme.colors.foreground,
    },
    sub: {
        fontFamily: "DM Sans",
        fontSize: 13,
        color: theme.colors.mutedForeground,
    },
    body: {
        marginHorizontal: 4,
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.mutedForeground,
    },
    note: {
        marginHorizontal: 4,
        fontFamily: "DM Sans",
        fontSize: 13,
        color: theme.colors.idleInk,
    },
    working: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 18,
    },
    error: {
        marginHorizontal: 4,
        fontFamily: "DM Sans",
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.dndInk,
    },
    row: {
        flexDirection: "row",
        gap: 10,
        paddingTop: 4,
    },
    notMe: { flex: 1 },
    approve: { flex: 1.4 },
    outcome: {
        alignItems: "center",
        gap: 12,
        paddingTop: 14,
        paddingHorizontal: 4,
    },
    outcomeTitle: {
        marginTop: 6,
        fontFamily: "DM Sans",
        fontSize: 20,
        fontWeight: "600",
        textAlign: "center",
        color: theme.colors.foreground,
    },
    outcomeBody: {
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 21,
        textAlign: "center",
        color: theme.colors.mutedForeground,
    },
    advice: {
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 21,
        textAlign: "center",
        color: theme.colors.foreground,
    },
    outcomeActions: {
        alignSelf: "stretch",
        gap: 6,
        marginTop: 10,
    },
    tile: (background: string, large: boolean) => ({
        width: large ? 64 : 44,
        height: large ? 64 : 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: large ? 22 : 14,
        backgroundColor: background,
    }),
}))
