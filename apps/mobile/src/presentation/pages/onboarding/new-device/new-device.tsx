import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, ScrollView, type ScrollViewInstance, Text, useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { SegmentedTabs } from "@/presentation/molecules/segmented-tabs/segmented-tabs"
import { DeviceWay } from "@/presentation/organisms/device-way/device-way"
import type { RestoreVariant } from "@pinai/domain/models/restore-page"
import { useNewDeviceViewModel } from "./new-device.viewmodel"
import { ResetNote } from "./reset-note"
import { setterOf } from "@/presentation/organisms/start-over-way/start-over-wording"
import { StartOverWay } from "@/presentation/organisms/start-over-way/start-over-way"
import { WordsWay } from "@/presentation/organisms/words-way/words-way"

const ROLLED_BACK =
    "Your instance went back on your account's history key: it now serves an older one than your devices have seen. No device can start over from it — only your instance can put the key back."

const UNKNOWN_CHANGE = [
    "None of your devices set a new passphrase: your instance replaced your history key, went back to an older one, or swapped how it approves devices. Until it's settled, this device trusts nothing new and stays here.",
    "• Your instance puts the key back: “Check again” lets this device in.",
    "• Or start over from here: this device becomes your reference.",
]

/**
 * "New device", after the prototype's — and the reset page, the same with the web's words: the ways into the account's
 * history, one page each, swiped or picked.
 */
export function NewDevicePage({ variant = "new-device" }: { variant?: RestoreVariant }) {
    const insets = useSafeAreaInsets()
    const { theme } = useUnistyles()
    const { width } = useWindowDimensions()
    const pager = useRef<ScrollViewInstance>(null)
    const vm = useNewDeviceViewModel(variant)
    const WAYS = vm.ways
    // The way it opens on, once: later picks scroll the pager themselves.
    const [openedAt] = useState(() => ({
        x:
            Math.max(
                0,
                WAYS.findIndex((way) => way.id === vm.tab)
            ) * width,
        y: 0,
    }))
    // A tab picked, or one the page opens by itself: the pager follows; a swipe sets the tab where it already is.
    useEffect(() => {
        pager.current?.scrollTo({
            x:
                Math.max(
                    0,
                    WAYS.findIndex((way) => way.id === vm.tab)
                ) * width,
            animated: true,
        })
    }, [vm.tab, width, WAYS])

    if (vm.view.kind === "loading") {
        return (
            <View style={[styles.screen(insets.top, insets.bottom), styles.centered]}>
                <ActivityIndicator color={theme.colors.mutedForeground} />
                <Text
                    accessibilityLiveRegion="polite"
                    style={styles.lede}
                >
                    Setting up this device…
                </Text>
            </View>
        )
    }

    if (vm.view.kind === "failed") {
        return (
            <View style={[styles.screen(insets.top, insets.bottom), styles.padded]}>
                <View style={styles.body}>
                    <Text
                        accessibilityRole="header"
                        style={styles.title}
                    >
                        Couldn&apos;t set up this device
                    </Text>
                    <Text style={styles.lede}>{vm.view.message}</Text>
                </View>
                <Button
                    label="Try again"
                    onPress={vm.onRetry}
                />
                <Button
                    label="Sign out"
                    variant="quiet"
                    onPress={vm.onSignOut}
                />
            </View>
        )
    }

    return (
        <View style={styles.screen(insets.top, insets.bottom)}>
            <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.scroll}
            >
                <View style={styles.padded}>
                    <Text style={styles.host}>{vm.host}</Text>
                    <Text
                        accessibilityRole="header"
                        style={styles.title}
                    >
                        {vm.title}
                    </Text>
                    {variant === "new-device" ? (
                        <Text style={[styles.lede, styles.intro]}>Your account is signed in. To bring your conversations here, choose one way.</Text>
                    ) : (
                        <View style={styles.intro} />
                    )}
                    {vm.notice && (
                        <Text
                            accessibilityLiveRegion="polite"
                            style={styles.notice}
                        >
                            {vm.notice}
                        </Text>
                    )}
                    {vm.rolledBack ? (
                        <ResetNote
                            eyebrow="What happened"
                            lines={[ROLLED_BACK]}
                            onCheckAgain={vm.onIn}
                        />
                    ) : !vm.offersWayIn && vm.resetCause === null ? (
                        <ResetNote
                            eyebrow="Your history key"
                            lines={["Reading what changed on your instance…"]}
                            onCheckAgain={vm.onIn}
                        />
                    ) : !vm.offersWayIn && !vm.startOverShown ? (
                        <ResetNote
                            eyebrow="What happened"
                            lines={UNKNOWN_CHANGE}
                            onCheckAgain={vm.onIn}
                            actions={
                                <Button
                                    label="Start over from here"
                                    variant="erase"
                                    onPress={() => vm.showStartOver(true)}
                                />
                            }
                        />
                    ) : !vm.offersWayIn ? (
                        <View>
                            <StartOverWay
                                reason="unknown-change"
                                own={vm.own}
                                ready={vm.startOverReady}
                                returnTo={vm.returnTo}
                                onStartedOver={vm.onStartedOver}
                                onWentOtherwise={vm.onWentOtherwise}
                                onRolledBack={vm.onRolledBack}
                                onBusy={vm.onStartOverBusy}
                            />
                            <Button
                                label="← What happened"
                                variant="quiet"
                                disabled={vm.busy}
                                onPress={() => vm.showStartOver(false)}
                            />
                        </View>
                    ) : (
                        <SegmentedTabs
                            label="Ways to bring your history"
                            tabs={WAYS}
                            selected={vm.tab}
                            onSelect={vm.setTab}
                            disabled={vm.busy}
                        />
                    )}
                </View>
                {!vm.rolledBack && vm.offersWayIn && (
                    <>
                        <ScrollView
                            ref={pager}
                            horizontal
                            pagingEnabled
                            contentOffset={openedAt}
                            scrollEnabled={!vm.busy}
                            showsHorizontalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            onMomentumScrollEnd={(event) => {
                                const way = WAYS[Math.round(event.nativeEvent.contentOffset.x / width)]
                                if (way) vm.setTab(way.id)
                            }}
                            style={styles.pager}
                        >
                            <View style={styles.way(width)}>
                                <DeviceWay
                                    active={vm.tab === "device"}
                                    deviceReady={vm.deviceReady}
                                    share={vm.share}
                                    onApproved={vm.onApproved}
                                    onIn={vm.onIn}
                                    instruction={
                                        variant === "reset"
                                            ? `Open Pīna'i on ${vm.replacedOn ?? "the device that reset your history"} and type this code when it asks.`
                                            : undefined
                                    }
                                />
                            </View>
                            <View style={styles.way(width)}>
                                <WordsWay
                                    active={vm.tab === "words"}
                                    setUp={vm.setUp}
                                    onTyping={vm.onTyping}
                                    onIn={vm.onIn}
                                    help={
                                        variant === "reset"
                                            ? `The new words, from ${vm.replacedOn ?? "the device that reset your history"}: your old ones no longer open your history. Pasting all of them at once works.`
                                            : undefined
                                    }
                                />
                            </View>
                            <View style={styles.way(width)}>
                                {variant === "reset" && (
                                    <View style={styles.passwordFirst}>
                                        <Text style={styles.passwordEyebrow}>First, your password</Text>
                                        <Text
                                            accessibilityRole="header"
                                            style={styles.passwordHeading}
                                        >
                                            Change your password
                                        </Text>
                                        <Text style={styles.passwordBody}>
                                            Whoever has {setterOf("not-me", vm.replacedOn)} has your password too. Change it with a reset link —
                                            &ldquo;Forgot password?&rdquo; on your instance&apos;s sign-in page, or ask its admin for one. That signs
                                            every session out, theirs and this one: once you&apos;ve signed in again, come back here to start over.
                                            This device then waits until that device has gone 7 days unused. As long as they can still use it, it
                                            never finishes — which is why the password comes first.
                                        </Text>
                                    </View>
                                )}
                                <StartOverWay
                                    reason={variant === "reset" ? "not-me" : "lost-everything"}
                                    replacedOn={vm.replacedOn}
                                    refused={vm.refused}
                                    own={vm.own}
                                    ready={vm.startOverReady}
                                    returnTo={vm.returnTo}
                                    onStartedOver={vm.onStartedOver}
                                    onWentOtherwise={vm.onWentOtherwise}
                                    onRolledBack={vm.onRolledBack}
                                    onBusy={vm.onStartOverBusy}
                                    onApproveInstead={() => vm.setTab("device")}
                                />
                            </View>
                        </ScrollView>
                        <View
                            importantForAccessibility="no-hide-descendants"
                            style={styles.dots}
                        >
                            {WAYS.map((way) => (
                                <View
                                    key={way.id}
                                    style={styles.dot(way.id === vm.tab)}
                                />
                            ))}
                        </View>
                        <Text
                            importantForAccessibility="no"
                            style={styles.swipe}
                        >
                            Swipe between the ways
                        </Text>
                    </>
                )}
                <View style={styles.padded}>
                    <Button
                        label="Sign out"
                        variant="quiet"
                        onPress={vm.onSignOut}
                    />
                </View>
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    screen: (top: number, bottom: number) => ({
        flex: 1,
        paddingTop: top,
        paddingBottom: Math.max(bottom, 16),
        backgroundColor: theme.colors.background,
    }),
    centered: { alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 20 },
    padded: { paddingHorizontal: 20 },
    body: { flex: 1, justifyContent: "center", gap: 12 },
    scroll: { paddingTop: 6, paddingBottom: 16 },
    host: {
        marginTop: 6,
        fontFamily: "DM Sans",
        fontSize: 13,
        color: theme.colors.mutedForeground,
    },
    title: {
        marginTop: 6,
        fontFamily: "Instrument Serif",
        fontSize: 34,
        lineHeight: 36,
        letterSpacing: -0.51,
        color: theme.colors.foreground,
    },
    lede: {
        fontFamily: "DM Sans",
        fontSize: 15,
        lineHeight: 22.5,
        color: theme.colors.mutedForeground,
    },
    intro: { marginTop: 8, marginBottom: 18 },
    notice: {
        marginBottom: 14,
        fontFamily: "DM Sans",
        fontSize: 13,
        lineHeight: 19,
        color: theme.colors.idleInk,
    },
    passwordFirst: {
        marginBottom: 14,
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
    },
    passwordEyebrow: {
        fontFamily: "DM Sans",
        fontSize: 11,
        fontWeight: "500",
        letterSpacing: 0.11,
        color: theme.colors.dndInk,
    },
    passwordHeading: {
        marginTop: 4,
        fontFamily: "DM Sans",
        fontSize: 17,
        fontWeight: "700",
        color: theme.colors.dndInk,
    },
    passwordBody: {
        marginTop: 8,
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 21,
        color: theme.colors.mutedForeground,
    },
    eyebrow: {
        fontFamily: "DM Sans",
        fontSize: 11,
        fontWeight: "500",
        letterSpacing: 0.11,
        color: theme.colors.mutedForeground,
    },
    pager: { marginTop: 18 },
    way: (width: number) => ({
        width,
        paddingHorizontal: 20,
    }),
    dots: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 6,
        marginTop: 16,
    },
    dot: (on: boolean) => ({
        width: on ? 18 : 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: on ? theme.colors.chat : theme.colors.borderStrong,
    }),
    swipe: {
        marginTop: 10,
        textAlign: "center",
        fontFamily: "Azeret Mono",
        fontSize: 11,
        letterSpacing: 0.22,
        color: theme.colors.mutedForeground,
    },
}))
