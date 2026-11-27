import { NavigationBar } from "expo-navigation-bar"
import { router, Stack, usePathname } from "expo-router"
import * as SplashScreen from "expo-splash-screen"
import { StatusBar } from "expo-status-bar"
import { useEffect } from "react"
import { Platform, View } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { getAuthNavigation } from "@/ioc"
import { Grain } from "@/presentation/atoms/grain/grain"
import { followAccountAppearance } from "@/presentation/_libs/appearance"
import { keepSessionAlive, resumeKeptSession } from "@/presentation/_libs/session"
import { keepSocketOpen } from "@/presentation/_libs/socket"

// Held while a kept session is picked up, so the first screen is the right one.
void SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
    const { theme, rt } = useUnistyles()
    const light = rt.themeName?.endsWith("-light")
    const pathname = usePathname()

    useEffect(() => getAuthNavigation().track(pathname), [pathname])

    useEffect(() => {
        followAccountAppearance()
        void resumeKeptSession()
            .then((outcome) => {
                keepSessionAlive()
                keepSocketOpen()
                if (outcome?.kind === "unreachable") router.replace("/unreachable")
            })
            .finally(() => SplashScreen.hide())
    }, [])

    return (
        // Gestures (a row swiped open) need their root above every screen.
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={styles.root}>
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
                    <Stack.Screen
                        name="status"
                        options={{
                            presentation: "formSheet",
                            sheetAllowedDetents: "fitToContents",
                            sheetCornerRadius: 22,
                            contentStyle: { backgroundColor: theme.colors.popover },
                        }}
                    />
                    <Stack.Screen
                        name="history-reset"
                        options={{
                            presentation: "formSheet",
                            sheetAllowedDetents: [0.92],
                            sheetCornerRadius: 22,
                            contentStyle: { backgroundColor: theme.colors.popover },
                        }}
                    />
                    <Stack.Screen
                        name="words"
                        options={{
                            presentation: "formSheet",
                            sheetAllowedDetents: [0.92],
                            sheetCornerRadius: 22,
                            contentStyle: { backgroundColor: theme.colors.popover },
                        }}
                    />
                    <Stack.Screen
                        name="restore-words"
                        options={{
                            presentation: "formSheet",
                            sheetAllowedDetents: [0.92],
                            sheetCornerRadius: 22,
                            contentStyle: { backgroundColor: theme.colors.popover },
                        }}
                    />
                    <Stack.Screen
                        name="server"
                        options={{
                            presentation: "formSheet",
                            sheetAllowedDetents: [0.86],
                            sheetCornerRadius: 22,
                            contentStyle: { backgroundColor: theme.colors.popover },
                        }}
                    />
                </Stack>
                <Grain />
                <StatusBar style={light ? "dark" : "light"} />
                {Platform.OS === "android" && <NavigationBar style={light ? "dark" : "light"} />}
            </View>
        </GestureHandlerRootView>
    )
}

const styles = StyleSheet.create((theme) => ({
    root: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
}))
