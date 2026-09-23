import { useContext, useRef, useState } from "react"
import { Check, Copy, Edit, Reply, SmilePlus, Trash2 } from "lucide-react"
import { Button, Input, TextField, ToggleButton } from "react-aria-components"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { AttachmentFilmstrip } from "@/presentation/molecules/AttachmentFilmstrip/AttachmentFilmstrip"
import { ImageLightboxDialog } from "@/presentation/molecules/ImageLightboxDialog/ImageLightboxDialog"
import { MessageStatus } from "@/presentation/molecules/MessageStatus/MessageStatus"
import { SingleImageAttachment } from "@/presentation/molecules/SingleImageAttachment/SingleImageAttachment"
import { ReactionPickerContext } from "@/presentation/organisms/MessageList/MessageList.context"
import { isImageAttachment } from "@/presentation/_libs/attachments"
import { cn } from "@/presentation/_libs/utils"
import type { Attachment } from "@pinai/domain/models/dm"
import type { Message } from "@/lib/types"
import { useAppStore } from "@/store/store"
import { useMessageItemViewModel } from "./MessageItem.viewmodel"

/**
 * Back-compat lookup for legacy reaction keys ("thumbsup", "fire", …)
 * that may still sit in the persisted message cache. New reactions are
 * stored as the raw unicode character and fall straight through.
 */
const legacyEmojiKeyMap: Record<string, string> = {
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
    /** Groups send reactions to the group endpoint, not to `recipientAddress`. */
    isGroup: boolean
    /** First message in a same-author sequence: renders the avatar
     *  + author/time header. Continuation rows hide both and indent
     *  the body to align with the text column. */
    first: boolean
    onReply: (messageId: string) => void
    onRetry: (messageId: string) => void
    hasPendingIntent: (messageId: string) => boolean
    /** Open the page-level reaction picker anchored to the given button
     *  with the given reaction handler. Hosted by `MessageList` so the
     *  picker's own Virtualizer+ListBox isn't nested inside the
     *  message-list collection — that nesting breaks react-aria-components. */
    onOpenReactionPicker: (
        messageId: string,
        triggerEl: HTMLButtonElement,
        onReact: (emoji: string) => void,
    ) => void
}

export function MessageItem({
    message,
    conversationKey,
    recipientAddress,
    isGroup,
    first,
    onReply,
    onRetry,
    hasPendingIntent,
    onOpenReactionPicker,
}: MessageItemProps) {
    const { openMessageId } = useContext(ReactionPickerContext)
    const isReactionPickerOpen = openMessageId === message.id
    const vm = useMessageItemViewModel(
        message,
        conversationKey,
        recipientAddress,
        isGroup,
        onReply,
        onRetry,
        hasPendingIntent,
    )

    const avatarUrl = useAppStore((s) =>
        message.authorAddress ? s.avatarsByAddress[message.authorAddress] ?? null : null,
    )

    const [copied, setCopied] = useState(false)
    const [lightboxAttachment, setLightboxAttachment] = useState<Attachment | null>(null)
    // The lifted picker (in `MessageList`) reads this on open to anchor
    // the popover. Using a ref instead of a callback ref so React Aria's
    // refSetter inside `IconButton` works.
    const reactionButtonRef = useRef<HTMLButtonElement | null>(null)

    const attachments = message.attachments ?? []
    const isLoneImage =
        attachments.length === 1 &&
        isImageAttachment(attachments[0], message.attachmentKeys?.[attachments[0].id])

    return (
        <div
            className={cn(
                "group relative grid grid-cols-[40px_1fr] items-start gap-x-[14px]",
                first ? "pt-[14px] pb-[2px]" : "pb-[2px]",
            )}
        >
            {first ? (
                <Avatar initials={message.avatar} imageUrl={avatarUrl} size="md" />
            ) : (
                <span aria-hidden />
            )}

            <div className="min-w-0">
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
                                <span>{legacyEmojiKeyMap[r.emoji] ?? r.emoji}</span>
                                <span className="font-mono text-foreground">{r.count}</span>
                            </ToggleButton>
                        ))}
                    </div>
                )}
            </div>

            {/* Hover action bar — floating pill toolbar (variant A in
                design/screens/message-actions.jsx). The reaction picker
                itself is rendered up in `MessageList` so the inner
                EmojiPicker's Virtualizer+ListBox isn't nested inside
                the outer message-list collection. */}
            <div
                className={cn(
                    "absolute -top-3.5 right-3.5 z-[2] items-center gap-px rounded-full",
                    "border border-border-strong bg-popover px-1 py-[3px]",
                    "shadow-[0_10px_24px_oklch(0.05_0.005_60_/_0.45),0_2px_4px_oklch(0.05_0.005_60_/_0.4)]",
                    // Pinned visible while this message's reaction
                    // picker is open — otherwise `display:none` would
                    // collapse the trigger button's bounding rect and
                    // the popover would anchor to (0, 0).
                    isReactionPickerOpen ? "flex" : "hidden group-hover:flex",
                )}
            >
                <IconButton
                    ref={reactionButtonRef}
                    onPress={() => {
                        if (reactionButtonRef.current) {
                            onOpenReactionPicker(
                                message.id,
                                reactionButtonRef.current,
                                vm.handleReaction,
                            )
                        }
                    }}
                    aria-label="Add reaction"
                    className="h-7 w-7 rounded-[var(--radius-sm)] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                    <SmilePlus className="h-4 w-4" />
                </IconButton>
                <IconButton
                    onPress={vm.handleReply}
                    aria-label="Reply"
                    className="h-7 w-7 rounded-[var(--radius-sm)] text-muted-foreground hover:bg-accent hover:text-foreground"
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
                    className="h-7 w-7 rounded-[var(--radius-sm)] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                    <span className={cn("transition-all duration-200", copied ? "scale-110 text-green-500" : "")}>
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </span>
                </IconButton>
                {vm.isOwn && (
                    <IconButton
                        onPress={vm.startEdit}
                        aria-label="Edit message"
                        className="h-7 w-7 rounded-[var(--radius-sm)] text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <Edit className="h-4 w-4" />
                    </IconButton>
                )}
                {vm.isOwn && (
                    <>
                        {/* Vertical separator before the destructive
                            action — mirrors the design's `VSep` rhythm
                            between primary and destructive groups. */}
                        <div className="mx-px my-1 w-px self-stretch bg-border" />
                        <IconButton
                            onPress={vm.handleDelete}
                            aria-label="Delete message"
                            className="h-7 w-7 rounded-[var(--radius-sm)] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                            <Trash2 className="h-4 w-4" />
                        </IconButton>
                    </>
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
