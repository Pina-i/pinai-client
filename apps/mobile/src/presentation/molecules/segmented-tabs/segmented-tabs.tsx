import { Pressable, Text, View } from "react-native"
import { StyleSheet } from "react-native-unistyles"

interface SegmentedTabsProps<T extends string> {
    label: string
    tabs: readonly { id: T; label: string }[]
    selected: T
    onSelect: (id: T) => void
    disabled?: boolean
}

/** Tabs as one pill, the chosen one filled in the accent. */
export function SegmentedTabs<T extends string>({ label, tabs, selected, onSelect, disabled }: SegmentedTabsProps<T>) {
    return (
        <View
            accessibilityRole="tablist"
            accessibilityLabel={label}
            style={styles.pill}
        >
            {tabs.map((tab) => {
                const on = tab.id === selected
                return (
                    <Pressable
                        key={tab.id}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: on, disabled }}
                        disabled={disabled}
                        onPress={() => onSelect(tab.id)}
                        style={[styles.tab, on && styles.on]}
                    >
                        <Text style={[styles.label, on && styles.onLabel]}>{tab.label}</Text>
                    </Pressable>
                )
            })}
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    pill: {
        flexDirection: "row",
        gap: 4,
        padding: 4,
        borderRadius: 999,
        backgroundColor: theme.colors.surface2,
    },
    tab: {
        flex: 1,
        minHeight: 40,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
    },
    on: { backgroundColor: theme.colors.chat },
    label: {
        fontFamily: "DM Sans",
        fontSize: 14,
        color: theme.colors.mutedForeground,
    },
    onLabel: {
        fontWeight: "700",
        color: theme.colors.chatForeground,
    },
}))
