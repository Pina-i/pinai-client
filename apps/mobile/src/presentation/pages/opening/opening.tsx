import { useEffect, useState } from "react"
import { AccessibilityInfo, Animated, Easing, Text, View } from "react-native"
import { StyleSheet } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { Logo } from "@/presentation/atoms/logo/logo"
import { useOpeningViewModel } from "./opening.viewmodel"

const BAR_WIDTH = 90
const BAR_MS = 1200

interface OpeningProps {
    origin: string
    name: string
}

/** "Opening <instance>": the mark, a bar running to the instance's initial, then its sign-in pages. */
export function OpeningPage({ origin, name }: OpeningProps) {
    const vm = useOpeningViewModel(origin)
    const [progress] = useState(() => new Animated.Value(0))

    useEffect(() => {
        void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
            if (reduced) {
                progress.setValue(1)
                vm.barDone()
                return
            }
            Animated.timing(progress, {
                toValue: 1,
                duration: BAR_MS,
                easing: Easing.bezier(0.2, 0.8, 0.2, 1),
                useNativeDriver: true,
            }).start(() => vm.barDone())
        })
        // Once: the bar runs as the screen opens.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    if (vm.failed) {
        return (
            <View style={styles.screen}>
                <View style={styles.center}>
                    <Text
                        accessibilityRole="header"
                        style={styles.name}
                    >
                        {name}
                    </Text>
                    <Text style={styles.failure}>Couldn&apos;t start the sign-in at {vm.host}.</Text>
                </View>
                <Button
                    label="Back"
                    variant="quiet"
                    onPress={vm.back}
                />
            </View>
        )
    }

    return (
        <View style={styles.screen}>
            <View style={styles.center}>
                <View style={styles.track}>
                    <Logo size={40} />
                    <View
                        accessibilityRole="progressbar"
                        accessibilityLabel="Connecting"
                        style={styles.bar}
                    >
                        <Animated.View
                            style={[
                                styles.fill,
                                {
                                    transform: [
                                        { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-BAR_WIDTH / 2, 0] }) },
                                        { scaleX: progress },
                                    ],
                                },
                            ]}
                        />
                    </View>
                    <View style={styles.tile}>
                        <Text style={styles.initial}>{name.charAt(0).toUpperCase()}</Text>
                    </View>
                </View>
                <View style={styles.words}>
                    <Text style={styles.caption}>Opening</Text>
                    <Text
                        accessibilityRole="header"
                        style={styles.name}
                    >
                        {name}
                    </Text>
                    <Text style={styles.host}>{vm.host}</Text>
                </View>
            </View>
        </View>
    )
}

const styles = StyleSheet.create((theme, rt) => ({
    screen: {
        flex: 1,
        paddingTop: rt.insets.top,
        paddingBottom: rt.insets.bottom + 24,
        paddingHorizontal: 20,
        backgroundColor: theme.colors.background,
    },
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
    },
    track: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
    },
    bar: {
        width: BAR_WIDTH,
        height: 3,
        borderRadius: 3,
        overflow: "hidden",
        backgroundColor: theme.colors.borderStrong,
    },
    fill: {
        width: BAR_WIDTH,
        height: 3,
        backgroundColor: theme.colors.chat,
    },
    tile: {
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.borderStrong,
        backgroundColor: theme.colors.surface2,
    },
    initial: {
        fontFamily: "Instrument Serif",
        fontSize: 18,
        fontWeight: "600",
        color: theme.colors.foreground,
    },
    words: {
        alignItems: "center",
    },
    caption: {
        fontFamily: "DM Sans",
        fontSize: 13,
        color: theme.colors.mutedForeground,
    },
    name: {
        marginTop: 6,
        fontFamily: "Instrument Serif",
        fontSize: 30,
        lineHeight: 32,
        letterSpacing: -0.45,
        textAlign: "center",
        color: theme.colors.foreground,
    },
    host: {
        marginTop: 10,
        fontFamily: "Azeret Mono",
        fontSize: 11,
        letterSpacing: 0.22,
        color: theme.colors.mutedForeground,
    },
    failure: {
        fontFamily: "DM Sans",
        fontSize: 15,
        lineHeight: 22.5,
        textAlign: "center",
        color: theme.colors.mutedForeground,
    },
}))
