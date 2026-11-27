import { awaitsResend, canResend, UNDELIVERED_DM_HINT } from "@pinai/domain/models/dm"
import { isImageAttachment } from "@pinai/domain/models/image-preview"
import type { CachedTimelineMessage } from "@pinai/domain/ports/conversation-cache.port"
import { CircleAlert, File, Reply, RotateCcw } from "lucide-react-native"
import { memo } from "react"
import { Pressable, Text, View } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { Avatar } from "@/presentation/atoms/avatar/avatar"
import { timeOfDay } from "@/presentation/_libs/message-time"
import { AttachmentImage } from "@/presentation/molecules/attachment-image/attachment-image"
import { tint } from "@/theme/tint"

interface MessageRowProps {
    message: CachedTimelineMessage
    /** It starts a run: its author and time show. */
    first: boolean
    own: boolean
    avatarUrl: string | null
    isGroup: boolean
    onRetry: (messageId: string) => void
}

/** A message as the prototype's thread draws it: avatar, author in the serif, time, text, then what came with it. */
export const MessageRow = memo(function MessageRow({ message, first, own, avatarUrl, isGroup, onRetry }: MessageRowProps) {
    const { theme } = useUnistyles()
    const time = timeOfDay(message.createdAt)
    const showRetry = own && awaitsResend(message)
    const undelivered = own && (message.status === "failed" || message.status === "undelivered")
    const files = (message.attachments ?? []).map((attachment) => ({ attachment, key: message.attachmentKeys?.[attachment.id] }))
    const reactions = message.reactions?.filter((reaction) => reaction.count > 0) ?? []
    const label = [
        `${message.author}, ${time}`,
        message.replyTo && `replying to ${message.replyTo.author}: ${message.replyTo.content}`,
        message.content,
        message.edited && "edited",
        message.status === "sending" && "sending",
        ...files.map(({ key }) => key?.original_filename ?? "an attachment"),
        ...reactions.map((reaction) => `${reaction.emoji} ${reaction.count}${reaction.reacted ? ", yours among them" : ""}`),
    ]
        .filter(Boolean)
        .join(". ")

    return (
        <View style={[styles.row(first), showRetry && styles.retryCard]}>
            <View style={styles.avatarColumn}>
                {first && (
                    <Avatar
                        name={message.author}
                        seed={message.authorAddress ?? message.author}
                        imageUrl={avatarUrl}
                        tone={own ? "neutral" : undefined}
                    />
                )}
            </View>
            <View style={styles.body}>
                <View
                    accessible
                    accessibilityLabel={label}
                >
                    {message.replyTo && (
                        <View style={styles.reply}>
                            <Reply
                                size={12}
                                color={theme.colors.mutedForeground}
                                strokeWidth={1.9}
                            />
                            <Text style={styles.replyAuthor}>{message.replyTo.author}</Text>
                            <Text
                                numberOfLines={1}
                                style={styles.replyText}
                            >
                                {message.replyTo.content}
                            </Text>
                        </View>
                    )}
                    {first && (
                        <View style={styles.head}>
                            <Text
                                numberOfLines={1}
                                style={own ? styles.ownAuthor : styles.author}
                            >
                                {message.author}
                            </Text>
                            <Text style={styles.time}>{time}</Text>
                        </View>
                    )}
                    {message.content !== "" && (
                        <Text style={[styles.text, undelivered && styles.undeliveredText, message.status === "sending" && styles.sending]}>
                            {message.content}
                            {message.edited && <Text style={styles.edited}> (edited)</Text>}
                        </Text>
                    )}
                    {files.map(({ attachment, key }) =>
                        key && isImageAttachment(attachment, key) ? (
                            <AttachmentImage
                                key={attachment.id}
                                attachmentKey={key}
                            />
                        ) : (
                            <View
                                key={attachment.id}
                                style={styles.file}
                            >
                                <File
                                    size={15}
                                    color={theme.colors.mutedForeground}
                                    strokeWidth={1.9}
                                />
                                <Text
                                    numberOfLines={1}
                                    style={styles.fileName}
                                >
                                    {key?.original_filename ?? "Attachment"}
                                </Text>
                            </View>
                        )
                    )}
                    {reactions.length > 0 && (
                        <View style={styles.reactions}>
                            {reactions.map((reaction) => (
                                <View
                                    key={reaction.emoji}
                                    style={reaction.reacted ? styles.reactionMine : styles.reaction}
                                >
                                    <Text style={reaction.reacted ? styles.emojiMine : styles.emoji}>{reaction.emoji}</Text>
                                    <Text style={styles.count}>{reaction.count}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
                {undelivered &&
                    (showRetry ? (
                        <View
                            accessibilityRole="alert"
                            style={styles.delivery}
                        >
                            <View style={styles.notDelivered}>
                                <CircleAlert
                                    size={14}
                                    color={theme.colors.dndInk}
                                    strokeWidth={1.9}
                                />
                                <Text style={styles.notDeliveredText}>Not delivered</Text>
                            </View>
                            {!isGroup && <Text style={styles.hint}>{UNDELIVERED_DM_HINT}</Text>}
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={
                                    canResend(message) ? "Retry sending" : "Retry sending — this device doesn't have the message's text"
                                }
                                disabled={!canResend(message)}
                                onPress={() => onRetry(message.id)}
                                hitSlop={9}
                                style={({ pressed }) => [styles.retry, pressed && styles.retryPressed, !canResend(message) && styles.disabled]}
                            >
                                <RotateCcw
                                    size={12}
                                    color={theme.colors.foreground}
                                    strokeWidth={1.9}
                                />
                                <Text style={styles.retryLabel}>Retry</Text>
                            </Pressable>
                        </View>
                    ) : (
                        <Text style={styles.sentAgain}>Not delivered · Sent again</Text>
                    ))}
            </View>
        </View>
    )
})

const styles = StyleSheet.create((theme) => ({
    row: (first: boolean) => ({
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        paddingTop: first ? 14 : 5,
        paddingHorizontal: 16,
    }),
    retryCard: {
        marginHorizontal: 8,
        marginTop: 6,
        paddingHorizontal: 8,
        paddingBottom: 8,
        borderRadius: 14,
        backgroundColor: tint(theme.colors.dnd, 0.07),
    },
    avatarColumn: {
        width: 34,
    },
    body: {
        flex: 1,
        minWidth: 0,
    },
    reply: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 4,
    },
    replyAuthor: {
        fontFamily: "Instrument Serif",
        fontSize: 13,
        fontWeight: "600",
        color: theme.colors.chat,
    },
    replyText: {
        flexShrink: 1,
        fontFamily: "DM Sans",
        fontSize: 12,
        color: theme.colors.mutedForeground,
    },
    head: {
        flexDirection: "row",
        alignItems: "baseline",
        gap: 8,
    },
    author: {
        flexShrink: 1,
        fontFamily: "Instrument Serif",
        fontSize: 15,
        fontWeight: "600",
        color: theme.colors.foreground,
    },
    ownAuthor: {
        flexShrink: 1,
        fontFamily: "Instrument Serif",
        fontSize: 15,
        fontWeight: "600",
        color: theme.colors.chat,
    },
    time: {
        fontFamily: "Azeret Mono",
        fontSize: 10.5,
        letterSpacing: 0.3,
        color: theme.colors.mutedForeground,
    },
    text: {
        marginTop: 3,
        fontFamily: "DM Sans",
        fontSize: 14,
        lineHeight: 21,
        color: theme.colors.foreground,
    },
    undeliveredText: {
        color: theme.colors.mutedForeground,
    },
    sending: {
        opacity: 0.5,
    },
    edited: {
        fontSize: 11,
        color: theme.colors.mutedForeground,
    },
    file: {
        alignSelf: "flex-start",
        maxWidth: "100%",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
    },
    fileName: {
        flexShrink: 1,
        fontFamily: "DM Sans",
        fontSize: 13,
        color: theme.colors.foreground,
    },
    reactions: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 7,
    },
    reaction: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingVertical: 3,
        paddingHorizontal: 9,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
    },
    reactionMine: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingVertical: 3,
        paddingHorizontal: 9,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.chatLine,
        backgroundColor: theme.colors.chatSoft,
    },
    emoji: {
        fontSize: 12,
        color: theme.colors.mutedForeground,
    },
    emojiMine: {
        fontSize: 12,
        color: theme.colors.foreground,
    },
    count: {
        fontFamily: "Azeret Mono",
        fontSize: 10,
        fontWeight: "500",
        color: theme.colors.foreground,
    },
    delivery: {
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        marginTop: 7,
    },
    notDelivered: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    notDeliveredText: {
        fontFamily: "DM Sans",
        fontSize: 12,
        color: theme.colors.dndInk,
    },
    hint: {
        fontFamily: "DM Sans",
        fontSize: 11.5,
        color: theme.colors.mutedForeground,
    },
    retry: {
        height: 26,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 11,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: tint(theme.colors.dnd, 0.45),
        backgroundColor: tint(theme.colors.dnd, 0.14),
    },
    retryPressed: {
        backgroundColor: tint(theme.colors.dnd, 0.24),
    },
    disabled: {
        opacity: 0.5,
    },
    retryLabel: {
        fontFamily: "DM Sans",
        fontSize: 12,
        fontWeight: "500",
        color: theme.colors.foreground,
    },
    sentAgain: {
        marginTop: 7,
        fontFamily: "DM Sans",
        fontSize: 12,
        color: theme.colors.mutedForeground,
    },
}))
