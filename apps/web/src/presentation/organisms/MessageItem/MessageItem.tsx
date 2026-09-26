import { useContext, useRef, useState } from "react"
import { Check, Copy, Pencil, Reply, Smile, Trash2 } from "lucide-react"
import { Button, Input, TextField, ToggleButton } from "react-aria-components"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { AttachmentFilmstrip } from "@/presentation/molecules/AttachmentFilmstrip/AttachmentFilmstrip"
import { ImageLightboxDialog } from "@/presentation/molecules/ImageLightboxDialog/ImageLightboxDialog"
import { MessageDeliveryState } from "@/presentation/molecules/MessageDeliveryState/MessageDeliveryState"
import { MessageStatus } from "@/presentation/molecules/MessageStatus/MessageStatus"
import { SingleImageAttachment } from "@/presentation/molecules/SingleImageAttachment/SingleImageAttachment"
import { MessageThreadContext, ReactionPickerContext } from "@/presentation/organisms/MessageList/MessageList.context"
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
    canResend: (message: Message) => boolean
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
    canResend,
    onOpenReactionPicker,
}: MessageItemProps) {
    const { openMessageId } = useContext(ReactionPickerContext)
    const isReactionPickerOpen = openMessageId === message.id
    const { resentCopies, flashedMessageId, jumpToMessage } = useContext(MessageThreadContext)
    const resentCopy = resentCopies.get(message.id)
    const resentFrom = message.resentFrom
    const vm = useMessageItemViewModel(
        message,
        conversationKey,
        recipientAddress,
        isGroup,
        onReply,
        onRetry,
        canResend,
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
        // A continuation of the same author's run sits tight under the previous
        // row; the space between runs comes from the list item wrapping a first row.
        <div
            className={cn(
                "group relative grid grid-cols-[38px_1fr] items-start gap-x-3.5 rounded-[14px] px-1.5",
                // A message waiting to be sent again stands out as its own tinted card.
                vm.showRetry
                    ? "my-0.5 bg-[color-mix(in_oklab,var(--dnd)_7%,transparent)] py-2 hover:bg-[color-mix(in_oklab,var(--dnd)_11%,transparent)]"
                    : cn("hover:bg-surf", first ? "pt-2 pb-0.5" : "py-0.5"),
                flashedMessageId === message.id && "animate-[pn-flash_1.6s_ease-out]",
            )}
        >
            {first ? (
                <Avatar
                    initials={message.avatar}
                    imageUrl={avatarUrl}
                    size="md"
                    seed={message.authorAddress ?? message.author}
                    tone={vm.isOwn ? "neutral" : undefined}
                />
            ) : (
                <span aria-hidden />
            )}

            <div className="min-w-0">
                {message.replyTo && (
                    <div className="mb-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <Reply className="h-3 w-3 shrink-0" />
                        <span className="title shrink-0 text-[13px] font-semibold text-acc">
                            {message.replyTo.author}
                        </span>
                        <span className="truncate">{message.replyTo.content}</span>
                    </div>
                )}

                {first && (
                    <div className="flex items-baseline">
                        <span
                            className={cn(
                                "title text-[15px] font-semibold",
                                vm.isOwn ? "text-acc" : "text-foreground",
                            )}
                        >
                            {message.author}
                        </span>
                        <span className="ml-[9px] font-mono text-[10px] text-muted-foreground">
                            {message.timestamp}
                        </span>
                        {vm.isOwn && (
                            <span className="ml-2 self-center">
                                <MessageStatus
                                    status={message.status}
                                    statusAt={message.statusAt}
                                />
                            </span>
                        )}
                    </div>
                )}

                {vm.isEditing ? (
                    <div className="mt-1 flex items-center gap-2">
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
                                className="w-full rounded-[12px] border border-line bg-surf2 px-3 py-1.5 text-[14px] text-foreground outline-none transition-colors focus:border-acc"
                                autoFocus
                            />
                        </TextField>
                        <Button
                            onPress={vm.commitEdit}
                            className="cursor-pointer rounded-full bg-action px-3 py-1.5 text-[11.5px] font-bold text-action-foreground outline-none hover:opacity-90"
                        >
                            Save
                        </Button>
                        <Button
                            onPress={vm.cancelEdit}
                            className="cursor-pointer rounded-full border border-line2 px-3 py-1.5 text-[11.5px] text-muted-foreground outline-none hover:bg-surf2 hover:text-foreground"
                        >
                            Cancel
                        </Button>
                    </div>
                ) : (
                    message.content && (
                        <p
                            className={cn(
                                "text-[14px] leading-[1.58] [text-wrap:pretty]",
                                vm.isUndelivered ? "text-muted-foreground" : "text-foreground",
                                vm.isUndelivered && !vm.showRetry && "opacity-75",
                                message.status === "sending" && "opacity-50",
                                first && "mt-1",
                            )}
                        >
                            {message.content}
                            {message.edited && (
                                <span className="ml-1 text-[11px] text-muted-foreground">(edited)</span>
                            )}
                        </p>
                    )
                )}

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

                {message.reactions && message.reactions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {message.reactions.map((r) => (
                            <ToggleButton
                                key={r.emoji}
                                isSelected={r.reacted}
                                onChange={() => vm.handleReaction(r.emoji)}
                                aria-label={`React with ${r.emoji}`}
                                className={cn(
                                    "inline-flex cursor-pointer items-center gap-[7px] rounded-full border px-[11px] py-[3px] text-[11.5px] outline-none transition-colors duration-150",
                                    "focus-visible:ring-2 focus-visible:ring-ring",
                                    r.reacted
                                        ? "border-acc-line bg-acc-soft text-foreground"
                                        : "border-transparent bg-surf2 text-muted-foreground hover:border-line2",
                                )}
                            >
                                <span>{legacyEmojiKeyMap[r.emoji] ?? r.emoji}</span>
                                <span className="font-mono text-foreground">{r.count}</span>
                            </ToggleButton>
                        ))}
                    </div>
                )}

                {vm.isOwn && (
                    <MessageDeliveryState
                        status={message.status}
                        awaitsResend={vm.showRetry}
                        canRetry={vm.canRetry}
                        onRetry={vm.retrySend}
                        resentAs={
                            resentCopy && {
                                timestamp: resentCopy.timestamp,
                                onJump: () => jumpToMessage(resentCopy.id),
                            }
                        }
                        onJumpToOriginal={resentFrom ? () => jumpToMessage(resentFrom) : undefined}
                    />
                )}
            </div>

            {/* The reaction picker lives in `MessageList` so its ListBox isn't
                nested in the message ListBox; while it's open the bar stays
                shown, or the trigger's rect collapses and the popover anchors
                to (0, 0). */}
            <div
                className={cn(
                    "absolute -top-3 right-3 z-[2] items-center gap-0.5 rounded-full",
                    "border border-line2 bg-surf2 px-[5px] py-[3px] backdrop-blur-[10px]",
                    "shadow-[0_8px_22px_-10px_rgba(0,0,0,0.6)]",
                    isReactionPickerOpen ? "flex" : "hidden group-hover:flex",
                )}
            >
                <IconButton
                    ref={reactionButtonRef}
                    variant="ghost"
                    isActive={isReactionPickerOpen}
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
                >
                    <Smile className="h-4 w-4" />
                </IconButton>
                <IconButton variant="ghost" onPress={vm.handleReply} aria-label="Reply">
                    <Reply className="h-4 w-4" />
                </IconButton>
                <IconButton
                    variant="ghost"
                    onPress={() => {
                        navigator.clipboard.writeText(message.content)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1500)
                    }}
                    aria-label="Copy text"
                    className={copied ? "text-on hover:text-on" : undefined}
                >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </IconButton>
                {vm.isOwn && (
                    <IconButton variant="ghost" onPress={vm.startEdit} aria-label="Edit message">
                        <Pencil className="h-4 w-4" />
                    </IconButton>
                )}
                {vm.isOwn && (
                    <>
                        <i aria-hidden className="mx-0.5 my-1 w-px self-stretch bg-line2" />
                        <IconButton
                            variant="ghost"
                            onPress={vm.handleDelete}
                            aria-label="Delete message"
                            className="hover:text-dnd"
                        >
                            <Trash2 className="h-4 w-4" />
                        </IconButton>
                    </>
                )}
            </div>

            {/* Mounted only while open: one idle lightbox per row would subscribe every row to the avatar map. */}
            {lightboxAttachment && (
                <ImageLightboxDialog
                    isOpen
                    onClose={() => setLightboxAttachment(null)}
                    attachment={lightboxAttachment}
                    attachmentKey={message.attachmentKeys?.[lightboxAttachment.id]}
                    senderAddress={message.authorAddress}
                    senderDisplayName={message.author}
                    timeLabel={message.timestamp}
                />
            )}
        </div>
    )
}
