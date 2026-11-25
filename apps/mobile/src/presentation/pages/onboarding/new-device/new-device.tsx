import { useRef, useState } from "react"
import { ActivityIndicator, ScrollView, type ScrollViewInstance, Text, useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { SegmentedTabs } from "@/presentation/molecules/segmented-tabs/segmented-tabs"
import { DeviceWay } from "./device-way/device-way"
import { useNewDeviceViewModel, WAYS } from "./new-device.viewmodel"
import { WordsWay } from "./words-way/words-way"

/** "New device", after the prototype's: the ways into the account's history, one page each, swiped or picked. */
export function NewDevicePage() {
    const insets = useSafeAreaInsets()
    const { theme } = useUnistyles()
    const { width } = useWindowDimensions()
    const pager = useRef<ScrollViewInstance>(null)
    const vm = useNewDeviceViewModel()
    // The way it opens on, once: later picks scroll the pager themselves.
    const [openedAt] = useState(() => ({ x: Math.max(0, WAYS.findIndex((way) => way.id === vm.tab)) * width, y: 0 }))

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

    const pick = (id: (typeof WAYS)[number]["id"]) => {
        vm.setTab(id)
        pager.current?.scrollTo({ x: WAYS.findIndex((way) => way.id === id) * width, animated: true })
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
                        New device
                    </Text>
                    <Text style={[styles.lede, styles.intro]}>Your account is signed in. To bring your conversations here, choose one way.</Text>
                    <SegmentedTabs
                        label="Ways to bring your history"
                        tabs={WAYS}
                        selected={vm.tab}
                        onSelect={pick}
                    />
                </View>
                <ScrollView
                    ref={pager}
                    horizontal
                    pagingEnabled
                    contentOffset={openedAt}
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
                        />
                    </View>
                    <View style={styles.way(width)}>
                        <WordsWay
                            active={vm.tab === "words"}
                            setUp={vm.setUp}
                            onTyping={vm.onTyping}
                            onIn={vm.onIn}
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
