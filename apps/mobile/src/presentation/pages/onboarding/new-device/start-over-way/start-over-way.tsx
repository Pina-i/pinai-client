import { RotateCcw } from "lucide-react-native"
import { useState } from "react"
import { ActivityIndicator, Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { Group } from "@/presentation/molecules/group/group"
import { RecentSignInSheet } from "@/presentation/molecules/recent-sign-in-sheet/recent-sign-in-sheet"
import { Sheet } from "@/presentation/molecules/sheet/sheet"
import { tint } from "@/theme/tint"
import { choiceText, endedLine, insteadLine, type StartOverReason } from "./start-over-wording"
import { type StartOverWayInput, useStartOverWay } from "./start-over-way.viewmodel"

export interface StartOverWayProps extends StartOverWayInput {
    reason: StartOverReason
    /** The setter's name, when this device found it approved. */
    replacedOn?: string | null
    /** "Approve with another device instead": the page's code way. */
    onApproveInstead?: () => void
}

/** "Start over": the choice and its confirmation, then this device's request — waiting, ready, or another device's first. */
export function StartOverWay({ reason, replacedOn = null, onApproveInstead, ...input }: StartOverWayProps) {
    const vm = useStartOverWay(input)
    const { theme } = useUnistyles()
    const [confirming, setConfirming] = useState(false)
    const busy = vm.asking || vm.starting || vm.withdrawing

    const instead = onApproveInstead && (
        <View style={styles.instead}>
            <Text style={styles.note}>{insteadLine(reason, replacedOn)}</Text>
            <Button
                label="Approve with another device instead"
                variant="secondary"
                disabled={busy}
                onPress={onApproveInstead}
            />
        </View>
    )
    const withdraw = (
        <Button
            label={vm.withdrawing ? "Withdrawing…" : "Withdraw the request"}
            variant="quiet"
            disabled={busy}
            onPress={vm.withdraw}
        />
    )
    const lines = (
        <>
            {[endedLine(vm.ended, reason, replacedOn), vm.tooMany].map(
                (line) =>
                    line && (
                        <Text
                            key={line}
                            accessibilityLiveRegion="polite"
                            style={styles.notice}
                        >
                            {line}
                        </Text>
                    )
            )}
            {vm.error && (
                <Text
                    accessibilityLiveRegion="polite"
                    style={styles.error}
                >
                    {vm.error}
                </Text>
            )}
        </>
    )

    return (
        <View accessibilityLabel="Start over">
            {vm.stage === "loading" && (
                <Group>
                    <View style={[styles.card, styles.loading]}>
                        <ActivityIndicator color={theme.colors.mutedForeground} />
                    </View>
                </Group>
            )}

            {vm.stage === "choice" && (
                <>
                    <Group>
                        <View style={styles.card}>
                            <View style={styles.tile}>
                                <RotateCcw
                                    size={20}
                                    color={theme.colors.dnd}
                                    strokeWidth={1.9}
                                />
                            </View>
                            {reason !== "lost-everything" && <Text style={styles.eyebrow}>{choiceText(reason, replacedOn).eyebrow}</Text>}
                            <Text
                                accessibilityRole="header"
                                style={styles.heading}
                            >
                                {choiceText(reason, replacedOn).heading}
                            </Text>
                            <Text style={styles.body}>{choiceText(reason, replacedOn).body}</Text>
                        </View>
                    </Group>
                    {lines}
                    <View style={styles.actions}>
                        <Button
                            label={vm.asking ? "Asking your devices…" : vm.starting ? "Starting over…" : "Erase history and start over"}
                            variant="erase"
                            disabled={!input.ready || busy}
                            onPress={() => setConfirming(true)}
                        />
                    </View>
                </>
            )}

            {vm.stage === "waiting" && (
                <>
                    <Group>
                        <View style={styles.card}>
                            <Text style={styles.eyebrow}>Start over · asked</Text>
                            <Text
                                accessibilityRole="header"
                                style={styles.heading}
                            >
                                Waiting on your other devices
                            </Text>
                            <Text style={styles.body}>
                                {vm.notYet
                                    ? `Not yet: you can finish on ${vm.readyOn}.`
                                    : `Your other devices have been told. If none of them is used for 7 days, you can finish here on ${vm.readyOn}.`}
                            </Text>
                        </View>
                    </Group>
                    {lines}
                    {instead}
                    <View style={styles.actions}>{withdraw}</View>
                </>
            )}

            {vm.stage === "ready" && (
                <>
                    <Group>
                        <View style={styles.card}>
                            <Text style={styles.eyebrow}>Start over · ready</Text>
                            <Text
                                accessibilityRole="header"
                                style={styles.heading}
                            >
                                You can finish starting over
                            </Text>
                            <Text style={styles.body}>
                                {vm.readyAtOnce ? "No approved device of yours to wait for." : "None of your other devices has been used for 7 days."} Finishing
                                erases your saved history and gives this device new words; your password is asked first.
                            </Text>
                        </View>
                    </Group>
                    {lines}
                    <View style={styles.actions}>
                        <Button
                            label={vm.starting ? "Starting over…" : "Finish starting over"}
                            variant="erase-filled"
                            disabled={busy}
                            onPress={vm.finish}
                        />
                        {withdraw}
                    </View>
                </>
            )}

            {vm.stage === "elsewhere" && (
                <>
                    <Group>
                        <View style={styles.card}>
                            <Text style={styles.eyebrow}>Start over</Text>
                            <Text
                                accessibilityRole="header"
                                style={styles.heading}
                            >
                                Another device asked first
                            </Text>
                            <Text style={styles.body}>
                                Another device has already asked to start your history over, and only one request can be open at a time: this one can ask once
                                that one is cancelled or withdrawn. Your approved devices can cancel it.
                            </Text>
                        </View>
                    </Group>
                    {lines}
                    {instead}
                </>
            )}

            <Sheet
                visible={confirming}
                label="Erase your saved history?"
                onClose={() => setConfirming(false)}
            >
                <Text
                    accessibilityRole="header"
                    style={styles.sheetTitle}
                >
                    Erase your saved history?
                </Text>
                <Text style={styles.sheetBody}>This can&apos;t be undone once it&apos;s done: messages from before today won&apos;t come back on any device.</Text>
                <View style={styles.sheetActions}>
                    <Button
                        label="Erase and start over"
                        variant="erase-filled"
                        onPress={() => {
                            setConfirming(false)
                            vm.startOver()
                        }}
                    />
                    <Button
                        label="Cancel"
                        variant="secondary"
                        onPress={() => setConfirming(false)}
                    />
                </View>
            </Sheet>
            <RecentSignInSheet recentSignIn={vm.recentSignIn} />
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    card: { paddingVertical: 18, paddingHorizontal: 16 },
    loading: { alignItems: "center", paddingVertical: 32 },
    tile: {
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 14,
        borderRadius: 14,
        backgroundColor: tint(theme.colors.dnd, 0.14),
    },
    eyebrow: {
        marginBottom: 4,
        fontFamily: "DM Sans",
        fontSize: 11,
        fontWeight: "500",
        letterSpacing: 0.11,
        color: theme.colors.mutedForeground,
    },
    heading: {
        fontFamily: "DM Sans",
        fontSize: 17,
        fontWeight: "700",
        color: theme.colors.foreground,
    },
    body: {
        marginTop: 8,
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 21,
        color: theme.colors.mutedForeground,
    },
    note: {
        fontFamily: "DM Sans",
        fontSize: 13,
        lineHeight: 19,
        color: theme.colors.mutedForeground,
    },
    notice: {
        marginTop: 10,
        marginHorizontal: 16,
        fontFamily: "DM Sans",
        fontSize: 13,
        lineHeight: 19,
        color: theme.colors.idleInk,
    },
    error: {
        marginTop: 10,
        marginHorizontal: 16,
        fontFamily: "DM Sans",
        fontSize: 13,
        lineHeight: 19,
        color: theme.colors.dndInk,
    },
    instead: { gap: 10, marginTop: 16, marginHorizontal: 4 },
    actions: { gap: 8, marginTop: 18 },
    sheetTitle: {
        fontFamily: "DM Sans",
        fontSize: 17,
        fontWeight: "700",
        textAlign: "center",
        color: theme.colors.foreground,
    },
    sheetBody: {
        marginTop: 8,
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 21,
        textAlign: "center",
        color: theme.colors.mutedForeground,
    },
    sheetActions: { gap: 10, marginTop: 18 },
}))
