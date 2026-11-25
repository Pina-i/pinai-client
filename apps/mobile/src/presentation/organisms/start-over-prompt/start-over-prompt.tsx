import { History, KeyRound, ShieldAlert } from "lucide-react-native"
import { Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { RecentSignInSheet } from "@/presentation/molecules/recent-sign-in-sheet/recent-sign-in-sheet"
import { Sheet } from "@/presentation/molecules/sheet/sheet"
import { tint } from "@/theme/tint"
import { type StartOverPromptViewModel, useStartOverPromptViewModel } from "./start-over-prompt.viewmodel"

const TITLES = { asked: "Is this you?", guide: "Approve it with a code", cancelled: "Cancelled." } as const

/** Another device asked to start the history over; shown to the devices that may cancel it, over every screen. */
export function StartOverPrompt() {
    const vm = useStartOverPromptViewModel()
    const { theme } = useUnistyles()
    return (
        <>
            <Sheet
                visible={vm.visible}
                label={TITLES[vm.stage]}
                onClose={vm.onDismiss}
            >
                <View style={styles.content}>
                    <View style={styles.head}>
                        <View style={styles.tile(tint(theme.colors.dnd, 0.14))}>
                            <History
                                size={20}
                                color={theme.colors.dnd}
                                strokeWidth={1.9}
                            />
                        </View>
                        <View style={styles.headText}>
                            <Text style={styles.eyebrow}>Start over request</Text>
                            <Text
                                accessibilityRole="header"
                                style={styles.title}
                            >
                                {TITLES[vm.stage]}
                            </Text>
                            <Text
                                numberOfLines={1}
                                style={styles.sub}
                            >
                                {vm.device} · {vm.asked}
                            </Text>
                        </View>
                    </View>
                    {vm.stage === "asked" && <Asked vm={vm} />}
                    {vm.stage === "guide" && <Guide vm={vm} />}
                    {vm.stage === "cancelled" && <Cancelled vm={vm} />}
                </View>
            </Sheet>
            <RecentSignInSheet recentSignIn={vm.recentSignIn} />
        </>
    )
}

function Asked({ vm }: { vm: StartOverPromptViewModel }) {
    return (
        <>
            <Text style={styles.lead}>Someone asked to start your history over from {vm.device}.</Text>
            <Text style={styles.body}>
                If nobody uses this device or another of your approved devices for 7 days, {vm.device} can erase your history backup
                and set new words for your account. Until then, you can cancel it from here.
            </Text>
            <ErrorLine error={vm.error} />
            <View style={styles.actions}>
                <Button
                    label={vm.cancelling ? "Cancelling…" : "Cancel — it wasn't me"}
                    variant="erase-filled"
                    disabled={vm.cancelling}
                    onPress={vm.onCancel}
                />
                {vm.answersCodes && (
                    <Button
                        label="It's me — approve with a code instead"
                        variant="secondary"
                        disabled={vm.cancelling}
                        onPress={vm.onItsMe}
                    />
                )}
                <Button
                    label="Not now"
                    variant="quiet"
                    disabled={vm.cancelling}
                    onPress={vm.onNotNow}
                />
            </View>
        </>
    )
}

function Guide({ vm }: { vm: StartOverPromptViewModel }) {
    const { theme } = useUnistyles()
    return (
        <>
            <View style={styles.line}>
                <KeyRound
                    size={16}
                    color={theme.colors.chat}
                    strokeWidth={1.9}
                />
                <Text style={[styles.body, styles.lineText]}>
                    On {vm.device}, choose &quot;Approve with another device instead&quot; under its request — or &quot;It was me&quot;, if it
                    shows a banner. It shows a 6-digit code: type it here when Pīna&apos;i asks for it. That keeps your history, and ends
                    the request.
                </Text>
            </View>
            <View style={styles.actions}>
                <Button
                    label="OK"
                    variant="secondary"
                    onPress={vm.onDone}
                />
            </View>
        </>
    )
}

function Cancelled({ vm }: { vm: StartOverPromptViewModel }) {
    const { theme } = useUnistyles()
    return (
        <>
            <View
                accessibilityLiveRegion="polite"
                style={styles.line}
            >
                <ShieldAlert
                    size={16}
                    color={theme.colors.dndInk}
                    strokeWidth={1.9}
                />
                <Text style={[styles.lead, styles.lineText]}>
                    This request is cancelled, but {vm.device} can ask again: whoever asked from it has your password. Change it now.
                </Text>
            </View>
            <Text style={styles.body}>{vm.advice}</Text>
            <Text style={styles.body}>
                {vm.signedOut ? `${vm.device} is signed out: it reads nothing new of yours.` : `Then sign ${vm.device} out, here or in Settings › Devices.`}
            </Text>
            <ErrorLine error={vm.error} />
            <View style={styles.actions}>
                {!vm.signedOut && (
                    <Button
                        label={vm.signingOut ? "Signing out…" : `Sign ${vm.device} out`}
                        variant="erase"
                        disabled={vm.signingOut}
                        onPress={vm.onSignOut}
                    />
                )}
                <Button
                    label="Done"
                    variant="secondary"
                    disabled={vm.signingOut}
                    onPress={vm.onDone}
                />
            </View>
        </>
    )
}

function ErrorLine({ error }: { error: string | null }) {
    if (!error) return null
    return (
        <Text
            accessibilityLiveRegion="polite"
            style={styles.error}
        >
            {error}
        </Text>
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
    headText: { flex: 1 },
    eyebrow: {
        fontFamily: "DM Sans",
        fontSize: 11,
        fontWeight: "500",
        letterSpacing: 0.11,
        color: theme.colors.mutedForeground,
    },
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
    lead: {
        marginHorizontal: 4,
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.foreground,
    },
    body: {
        marginHorizontal: 4,
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.mutedForeground,
    },
    line: {
        flexDirection: "row",
        gap: 10,
        marginHorizontal: 4,
        paddingTop: 2,
    },
    lineText: { flex: 1, marginHorizontal: 0 },
    error: {
        marginHorizontal: 4,
        fontFamily: "DM Sans",
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.dndInk,
    },
    actions: { gap: 8, paddingTop: 4 },
    tile: (background: string) => ({
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        backgroundColor: background,
    }),
}))
