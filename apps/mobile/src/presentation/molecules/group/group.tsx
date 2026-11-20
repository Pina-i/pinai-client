import { Children, type ReactNode } from "react"
import { Pressable, Text, View } from "react-native"
import { StyleSheet } from "react-native-unistyles"

/** A grouped list, as a settings screen draws one: rows on a raised surface, hairlines between. */
export function Group({ children }: { children: ReactNode }) {
    const rows = Children.toArray(children)
    return (
        <View style={styles.group}>
            {rows.map((row, i) => (
                <View key={i}>
                    {row}
                    {i > 0 && <View style={styles.divider} />}
                </View>
            ))}
        </View>
    )
}

export function GroupHeader({ children }: { children: string }) {
    return (
        <Text
            accessibilityRole="header"
            style={styles.header}
        >
            {children}
        </Text>
    )
}

export function GroupFooter({ children }: { children: string }) {
    return <Text style={styles.footer}>{children}</Text>
}

interface GroupRowProps {
    children: ReactNode
    onPress?: () => void
    disabled?: boolean
    accessibilityLabel?: string
    minHeight?: number
}

export function GroupRow({ children, onPress, disabled, accessibilityLabel, minHeight = 52 }: GroupRowProps) {
    if (!onPress) return <View style={styles.row(minHeight)}>{children}</View>
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [styles.row(minHeight), pressed && styles.pressed]}
        >
            {children}
        </Pressable>
    )
}

const styles = StyleSheet.create((theme) => ({
    group: {
        overflow: "hidden",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
    },
    divider: {
        position: "absolute",
        top: 0,
        left: 16,
        right: 0,
        height: 1,
        backgroundColor: theme.colors.border,
    },
    row: (minHeight: number) => ({
        minHeight,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
    }),
    pressed: {
        backgroundColor: theme.colors.surface2,
    },
    header: {
        marginTop: 22,
        marginBottom: 8,
        marginHorizontal: 16,
        fontFamily: "DM Sans",
        fontSize: 12.5,
        color: theme.colors.mutedForeground,
    },
    footer: {
        marginTop: 8,
        marginHorizontal: 16,
        fontFamily: "DM Sans",
        fontSize: 12.5,
        lineHeight: 18,
        color: theme.colors.mutedForeground,
    },
}))
