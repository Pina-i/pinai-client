import { useState } from "react"
import { Check, Copy, Edit, Reply, Smile, Trash2 } from "lucide-react"
import { Button, Input, TextField, ToggleButton } from "react-aria-components"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { AttachmentFilmstrip } from "@/presentation/molecules/AttachmentFilmstrip/AttachmentFilmstrip"
import { ImageLightboxDialog } from "@/presentation/molecules/ImageLightboxDialog/ImageLightboxDialog"
import { Menu, type MenuItemDescriptor } from "@/presentation/molecules/Menu/Menu"
import { MessageStatus } from "@/presentation/molecules/MessageStatus/MessageStatus"
import { SingleImageAttachment } from "@/presentation/molecules/SingleImageAttachment/SingleImageAttachment"
import { isImageAttachment } from "@/presentation/_libs/attachments"
import { cn } from "@/presentation/_libs/utils"
import type { Attachment } from "@/domain/models/dm"
import type { Message } from "@/lib/types"
import { useAppStore } from "@/store/store"
import { useMessageItemViewModel } from "./MessageItem.viewmodel"

const quickEmojis = ["thumbsup", "fire", "heart", "joy", "eyes", "rocket", "100", "clap"]

const emojiMap: Record<string, string> = {
    thumbsup: "👍",
    fire: "🔥",
    heart: "❤️",
    joy: "😂",
    eyes: "👀",
    rocket: "🚀",
    "100": "💯",
    clap: "👏",
}

interface MessageItemProps {
    message: Message
    conversationKey: string
    /** Federated address of the conversation's recipient. Threaded
     *  through from `ConversationPage` so reaction sends route to
     *  the right address even when `localDmConvos` hasn't refreshed
     *  yet (e.g. immediately after a first message — the sender's
     *  own WS echo skips the conversation-list invalidation). */
    recipientAddress: string
    /** First message in a same-author sequence: renders the avatar
     *  + author/time header. Continuation rows hide both and indent
     *  the body to align with the text column. */
    first: boolean
    onReply: (messageId: string) => void
    onRetry: (messageId: string) => void
    hasPendingIntent: (messageId: string) => boolean
}

export function MessageItem({
    message,
    conversationKey,
    recipientAddress,
    first,
    onReply,
    onRetry,
    hasPendingIntent,
}: MessageItemProps) {
    const vm = useMessageItemViewModel(
        message,
        conversationKey,
        recipientAddress,
        onReply,
        onRetry,
        hasPendingIntent,
    )

    const avatarUrl = useAppStore((s) =>
        message.authorAddress ? s.avatarsByAddress[message.authorAddress] ?? null : null,
    )

    const [copied, setCopied] = useState(false)
    const [lightboxAttachment, setLightboxAttachment] = useState<Attachment | null>(null)

    const attachments = message.attachments ?? []
    const isLoneImage =
        attachments.length === 1 &&
        isImageAttachment(attachments[0], message.attachmentKeys?.[attachments[0].id])

    const emojiMenuItems: MenuItemDescriptor[] = quickEmojis.map((key) => {
        const char = emojiMap[key] ?? key
        return {
            key,
            label: char,
            onAction: () => vm.handleReaction(char),
        }
    })

    return (
        <div
            className={cn(
                "group relative flex items-start gap-[14px]",
                first ? "pt-[14px] pb-[2px]" : "pl-[54px] pb-[2px]",
            )}
        >
            {first && (
                <Avatar initials={message.avatar} imageUrl={avatarUrl} size="md" />
            )}

            <div className="min-w-0 flex-1">
                {message.replyTo && (
                    <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Reply className="h-3 w-3 shrink-0" />
                        <span className="font-medium text-primary">
                            {message.replyTo.author}
                        </span>
                        <span className="truncate">{message.replyTo.content}</span>
                    </div>
                )}

                {first && (
                    <div className="mb-[3px] flex items-baseline gap-2">
                        <span
                            className={cn(
                                "title font-medium",
                                vm.isOwn ? "text-chat" : "text-foreground",
                            )}
                            style={{ fontSize: 14.5 }}
                        >
                            {message.author}
                        </span>
                        <span
                            className="font-mono text-muted-foreground"
                            style={{ fontSize: 10.5 }}
                        >
                            {message.timestamp}
                        </span>
                        {vm.isOwn && (
                            <MessageStatus
                                status={message.status}
                                statusAt={message.statusAt}
                                canRetry={vm.canRetry}
                                onRetry={vm.retrySend}
                            />
                        )}
                    </div>
                )}

                {vm.isEditing ? (
                    <div className="mt-1 flex gap-2">
                        <TextField
                            value={vm.editInput}
                            onChange={vm.setEditInput}
                            aria-label="Edit message"
                            className="flex-1"
                        >
                            <Input
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") vm.commitEdit()
                                    if (e.key === "Escape") vm.cancelEdit()
                                }}
                                className="w-full border border-border bg-input px-2 py-1 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                                autoFocus
                            />
                        </TextField>
                        <Button
                            onPress={vm.commitEdit}
                            className="text-xs text-primary outline-none cursor-pointer hover:underline"
                        >
                            save
                        </Button>
                        <Button
                            onPress={vm.cancelEdit}
                            className="text-xs text-muted-foreground outline-none cursor-pointer hover:underline"
                        >
                            cancel
                        </Button>
                    </div>
                ) : (
                    message.content && (
                        <p
                            className="text-foreground"
                            style={{ fontSize: 13.5, lineHeight: 1.55, textWrap: "pretty" }}
                        >
                            {message.content}
                            {message.edited && (
                                <span className="ml-1 text-xs text-muted-foreground">(edited)</span>
                            )}
                        </p>
                    )
                )}

                {/* Attachments — single image gets the click-to-expand layout,
                    everything else renders as a horizontal filmstrip. */}
                {attachments.length > 0 && (
                    isLoneImage ? (
                        <SingleImageAttachment
                            attachment={attachments[0]}
                            attachmentKey={message.attachmentKeys?.[attachments[0].id]}
                            onExpand={() => setLightboxAttachment(attachments[0])}
                        />
                    ) : (
                        <AttachmentFilmstrip
                            attachments={attachments}
                            attachmentKeys={message.attachmentKeys}
                            onImageClick={(a) => setLightboxAttachment(a)}
                        />
                    )
                )}

                {/* Reactions */}
                {message.reactions && message.reactions.length > 0 && (
                    <div className="mb-0.5 mt-1.5 flex flex-wrap gap-1.5">
                        {message.reactions.map((r) => (
                            <ToggleButton
                                key={r.emoji}
                                isSelected={r.reacted}
                                onChange={() => vm.handleReaction(r.emoji)}
                                aria-label={`React with ${r.emoji}`}
                                className={cn(
                                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] text-muted-foreground outline-none transition-colors",
                                    r.reacted
                                        ? "border-chat/45 bg-[color-mix(in_oklab,var(--chat)_10%,var(--muted))]"
                                        : "border-border bg-muted hover:border-border-strong",
                                )}
                            >
                                <span>{emojiMap[r.emoji] ?? r.emoji}</span>
                                <span className="font-mono text-foreground">{r.count}</span>
                            </ToggleButton>
                        ))}
                    </div>
                )}
            </div>

            {/* Hover action bar — also stays visible while a child menu (e.g. emoji picker) is open. */}
            <div className="absolute -top-3 right-2 hidden items-center gap-0.5 border border-border bg-popover p-0.5 shadow-lg group-hover:flex has-[[aria-expanded=true]]:flex">
                <Menu
                    trigger={
                        <IconButton
                            aria-label="Add reaction"
                            className="p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <Smile className="h-4 w-4" />
                        </IconButton>
                    }
                    items={emojiMenuItems}
                    placement="top end"
                    orientation="horizontal"
                />
                <IconButton
                    onPress={vm.handleReply}
                    aria-label="Reply"
                    className="p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                    <Reply className="h-4 w-4" />
                </IconButton>
                <IconButton
                    onPress={() => {
                        navigator.clipboard.writeText(message.content)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1500)
                    }}
                    aria-label="Copy text"
                    className="p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                    <span className={cn("transition-all duration-200", copied ? "scale-110 text-green-500" : "")}>
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </span>
                </IconButton>
                {vm.isOwn && (
                    <IconButton
                        onPress={vm.startEdit}
                        aria-label="Edit message"
                        className="p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <Edit className="h-4 w-4" />
                    </IconButton>
                )}
                {vm.isOwn && (
                    <IconButton
                        onPress={vm.handleDelete}
                        aria-label="Delete message"
                        className="p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                        <Trash2 className="h-4 w-4" />
                    </IconButton>
                )}
            </div>

            <ImageLightboxDialog
                isOpen={!!lightboxAttachment}
                onClose={() => setLightboxAttachment(null)}
                attachment={lightboxAttachment}
                attachmentKey={
                    lightboxAttachment ? message.attachmentKeys?.[lightboxAttachment.id] : undefined
                }
                senderAddress={message.authorAddress}
                senderDisplayName={message.author}
                timeLabel={message.timestamp}
            />
        </div>
    )
}
