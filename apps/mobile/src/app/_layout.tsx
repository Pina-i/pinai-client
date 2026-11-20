import { NavigationBar } from "expo-navigation-bar"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Grain } from "@/presentation/atoms/grain/grain"

export default function RootLayout() {
    const { theme, rt } = useUnistyles()
    const light = rt.themeName?.endsWith("-light")
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
