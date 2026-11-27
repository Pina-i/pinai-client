import type { ReactNode } from "react"
import { Text, View } from "react-native"
import { StyleSheet } from "react-native-unistyles"
import { Button } from "@/presentation/atoms/button/button"
import { Group } from "@/presentation/molecules/group/group"

/** What happened to the account's key, when no way in is offered: "Check again", and what else can be done. */
export function ResetNote({
    eyebrow,
    lines,
    onCheckAgain,
    actions,
}: {
    eyebrow: string
    lines: string[]
    onCheckAgain: () => void
    actions?: ReactNode
}) {
    return (
        <View>
            <Group>
                <View style={styles.card}>
                    <Text style={styles.eyebrow}>{eyebrow}</Text>
                    {lines.map((line) => (
                        <Text
                            key={line}
                            style={styles.body}
                        >
                            {line}
                        </Text>
                    ))}
                </View>
            </Group>
            <View style={styles.actions}>
                <Button
                    label="Check again"
                    variant="secondary"
                    onPress={onCheckAgain}
                />
                {actions}
            </View>
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    card: { paddingVertical: 18, paddingHorizontal: 16 },
    eyebrow: {
        fontFamily: "DM Sans",
        fontSize: 11,
        fontWeight: "500",
        letterSpacing: 0.11,
        color: theme.colors.mutedForeground,
    },
    body: {
        marginTop: 6,
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 21,
        color: theme.colors.mutedForeground,
    },
    actions: { gap: 8, marginTop: 18 },
}))
