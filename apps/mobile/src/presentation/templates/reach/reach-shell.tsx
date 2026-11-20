import type { ReactNode } from "react"
import { Pressable, View } from "react-native"
import { router, usePathname } from "expo-router"
import { StyleSheet } from "react-native-unistyles"
import { Backdrop } from "@/presentation/atoms/backdrop/backdrop"
import { Logo } from "@/presentation/atoms/logo/logo"

export const RAIL_WIDTH = 66

/** Reach: the rail at the left edge stays while the screens beside it change. */
export function ReachShell({ children }: { children: ReactNode }) {
    const atHome = usePathname() === "/home"
    return (
        <View style={styles.screen}>
            <Backdrop />
            <View
                accessibilityRole="menu"
                accessibilityLabel="Servers"
                style={styles.rail}
            >
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Home"
                    accessibilityState={{ selected: atHome }}
                    onPress={() => !atHome && router.navigate("/home")}
                    style={styles.homeTile}
                >
                    <Logo size={18} />
                </Pressable>
            </View>
            <View style={styles.content}>{children}</View>
        </View>
    )
}

const styles = StyleSheet.create((theme, rt) => ({
    screen: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    rail: {
        position: "absolute",
        top: rt.insets.top,
        left: 0,
        bottom: rt.insets.bottom,
        width: RAIL_WIDTH,
        alignItems: "center",
        paddingTop: 8,
        gap: 10,
    },
    homeTile: {
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.chatLine,
        backgroundColor: theme.colors.surface2,
    },
    content: {
        flex: 1,
        marginLeft: RAIL_WIDTH,
    },
}))
