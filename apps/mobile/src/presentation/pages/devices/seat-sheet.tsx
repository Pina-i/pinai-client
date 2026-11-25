import type { SeatsView } from "@pinai/domain/models/approval-handshake"
import type { RosterDevice } from "@pinai/domain/models/device-roster"
import type { SeatKind } from "@pinai/domain/models/waiting-seat"
import type { ApprovalAnswering } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { ActivityIndicator, Pressable, Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { NumberPad } from "@/presentation/molecules/number-pad/number-pad"
import { TypedCode } from "@/presentation/molecules/typed-code/typed-code"
import { useSeatSheetViewModel } from "./seat-sheet.viewmodel"

interface SeatSheetProps {
    device: RosterDevice
    kind: SeatKind
    answering: ApprovalAnswering | null
    seats: SeatsView
    signingOut: boolean
    onNotMine: () => void
    onClose: () => void
}

/** "Approve <device>": the prototype's sheet over Settings › Devices. Its parent `Sheet` holds it. */
export function SeatSheet(props: SeatSheetProps) {
    const { device, kind, signingOut, onNotMine, onClose } = props
    const vm = useSeatSheetViewModel(props)
    const { theme } = useUnistyles()
    const { state } = vm
    const { answer, label } = state
    const working = answer.kind === "working"

    return (
        <View style={styles.content}>
            <View style={styles.head}>
                <Text
                    accessibilityRole="header"
                    numberOfLines={1}
                    style={styles.title}
                >
                    Approve {label}
                </Text>
                {!working && (
                    <Pressable
                        accessibilityRole="button"
                        onPress={onClose}
                        hitSlop={10}
                    >
                        <Text style={styles.close}>{answer.kind === "approved" ? "Done" : "Cancel"}</Text>
                    </Pressable>
                )}
            </View>

            {answer.kind === "code" && (
                <>
                    <Text style={styles.body}>Type the code it shows.</Text>
                    {state.note && <Text style={styles.note}>{state.note}</Text>}
                    {state.hold && <Text style={styles.note}>{state.hold}</Text>}
                    <TypedCode code={vm.code} />
                    <NumberPad
                        disabled={signingOut}
                        onDigit={(digit) => vm.setCode(vm.code + digit)}
                        onDelete={() => vm.setCode(vm.code.slice(0, -1))}
                    />
                </>
            )}
            {answer.kind === "asks-nothing" && (
                <Text style={styles.body}>
                    {kind === "from-before"
                        ? `On ${device.display_name.trim() || "it"}, choose "It was me" if it shows a banner: the code it then shows comes here.`
                        : `On ${label}, choose to approve it from another device: the code it shows comes here.`}
                </Text>
            )}
            {answer.kind === "at-door" && <Text style={styles.body}>Being answered in the approval prompt.</Text>}
            {working && (
                <View style={styles.working}>
                    <ActivityIndicator color={theme.colors.mutedForeground} />
                    <Text
                        accessibilityLiveRegion="polite"
                        style={styles.body}
                    >
                        Checking the code with {label}…
                    </Text>
                </View>
            )}
            {answer.kind === "approved" && (
                <Text
                    accessibilityLiveRegion="polite"
                    style={styles.lead}
                >
                    {label} is one of your devices now. Your history is on its way to it.
                </Text>
            )}
            {state.failure && (
                <Text
                    accessibilityLiveRegion="polite"
                    style={styles.error}
                >
                    {state.failure}
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

            {working ? (
                <Button
                    label="Cancel"
                    variant="secondary"
                    onPress={vm.onCancel}
                />
            ) : answer.kind === "approved" ? null : (
                <View style={styles.row}>
                    {state.offersNotMine && (
                        <View style={styles.notMine}>
                            <Button
                                label={signingOut ? "Signing out…" : kind === "from-before" ? "Sign out" : "Not mine"}
                                variant="erase"
                                disabled={signingOut}
                                onPress={onNotMine}
                            />
                        </View>
                    )}
                    {answer.kind === "code" && (
                        <View style={styles.approve}>
                            <Button
                                label="Approve"
                                disabled={!vm.canApprove || signingOut}
                                onPress={vm.onApprove}
                            />
                        </View>
                    )}
                </View>
            )}
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    content: { gap: 14 },
    head: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 4,
    },
    title: {
        flex: 1,
        fontFamily: "DM Sans",
        fontSize: 17,
        fontWeight: "600",
        color: theme.colors.foreground,
    },
    close: {
        fontFamily: "DM Sans",
        fontSize: 15,
        color: theme.colors.chat,
    },
    lead: {
        marginHorizontal: 4,
        fontFamily: "DM Sans",
        fontSize: 15,
        lineHeight: 21,
        color: theme.colors.foreground,
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
        lineHeight: 18,
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
    notMine: { flex: 1 },
    approve: { flex: 1.4 },
}))
