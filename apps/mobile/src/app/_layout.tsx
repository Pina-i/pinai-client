import { NavigationBar } from "expo-navigation-bar"
import { router, Stack, usePathname } from "expo-router"
import * as SplashScreen from "expo-splash-screen"
import { StatusBar } from "expo-status-bar"
import { useEffect } from "react"
import { View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { getAuthNavigation } from "@/ioc"
import { Grain } from "@/presentation/atoms/grain/grain"
import { keepSessionAlive, resumeKeptSession } from "@/presentation/_libs/session"

// Held while a kept session is picked up, so the first screen is the right one.
void SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
    const { theme, rt } = useUnistyles()
    const light = rt.themeName?.endsWith("-light")
    const pathname = usePathname()

    useEffect(() => getAuthNavigation().track(pathname), [pathname])

    useEffect(() => {
        void resumeKeptSession()
            .then((outcome) => {
                keepSessionAlive()
                if (outcome?.kind === "unreachable") router.replace("/unreachable")
            })
            .finally(() => SplashScreen.hide())
    }, [])

    return (
        <View style={styles.root}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }} />
            <Grain />
            <StatusBar style={light ? "dark" : "light"} />
            <NavigationBar style={light ? "dark" : "light"} />
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    root: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
}))
