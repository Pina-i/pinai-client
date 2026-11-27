import { memo, useState } from "react"
import { Pressable, Text, View } from "react-native"
import { StyleSheet } from "react-native-unistyles"
import { timeOfDay } from "@/presentation/_libs/message-time"
import type { TimelineNotice } from "./timeline-rows"

/** A day's separator. */
export const DayLine = memo(function DayLine({ label }: { label: string }) {
    return (
        <View
            accessibilityRole="header"
            style={styles.day}
        >
            <View style={styles.rule} />
            <Text style={styles.dayLabel}>{label}</Text>
            <View style={styles.rule} />
        </View>
    )
})

/** A group's change, or someone's new device: centred between the messages; the second explains itself when pressed. */
export const NoticeLine = memo(function NoticeLine({ notice }: { notice: TimelineNotice }) {
    const [open, setOpen] = useState(false)
    const time = timeOfDay(notice.createdAt)
    if (!notice.explanation) {
        return (
            <View
                accessible
                accessibilityLabel={`${notice.text}, ${time}`}
                style={styles.notice}
            >
                <Text style={styles.noticeText}>
                    {notice.text} <Text style={styles.time}>{time}</Text>
                </Text>
            </View>
        )
    }
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${notice.text}, ${time}`}
            accessibilityHint="Says what a new device means"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((was) => !was)}
            style={styles.notice}
        >
            <Text style={styles.noticeText}>
                <Text style={styles.explained}>{notice.text}</Text> <Text style={styles.time}>{time}</Text>
            </Text>
            {open && <Text style={styles.explanation}>{notice.explanation}</Text>}
        </Pressable>
    )
})

const styles = StyleSheet.create((theme) => ({
    day: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingTop: 18,
        paddingBottom: 4,
        paddingHorizontal: 16,
    },
    rule: {
        flex: 1,
        height: 1,
        backgroundColor: theme.colors.border,
    },
    dayLabel: {
        fontFamily: "Azeret Mono",
        fontSize: 9.5,
        letterSpacing: 1.1,
        textTransform: "uppercase",
        color: theme.colors.mutedForeground,
    },
    notice: {
        alignItems: "center",
        paddingTop: 10,
        paddingHorizontal: 24,
    },
    noticeText: {
        textAlign: "center",
        fontFamily: "DM Sans",
        fontSize: 12.5,
        lineHeight: 18,
        color: theme.colors.mutedForeground,
    },
    explained: {
        textDecorationLine: "underline",
        textDecorationStyle: "dotted",
    },
    time: {
        fontFamily: "Azeret Mono",
        fontSize: 9.5,
        color: theme.colors.mutedForeground,
    },
    explanation: {
        marginTop: 6,
        maxWidth: 340,
        textAlign: "center",
        fontFamily: "DM Sans",
        fontSize: 13,
        lineHeight: 19,
        color: theme.colors.mutedForeground,
    },
}))
