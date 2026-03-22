import { useState } from "react"
import { Check, Copy, Edit, Reply, Smile, Trash2 } from "lucide-react"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { cn } from "@/presentation/_libs/utils"
import type { Message } from "@/lib/types"
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
    onReply: (messageId: string) => void
}

export function MessageItem({ message, conversationKey, onReply }: MessageItemProps) {
    const vm = useMessageItemViewModel(message, conversationKey, onReply)

    const [showEmojiPicker, setShowEmojiPicker] = useState(false)
    const [copied, setCopied] = useState(false)

    return (
        <div
            className={cn(
                "group relative flex gap-4 px-2 py-1.5",
                vm.isOwn
                    ? "border-l-2 border-primary/40 hover:bg-primary/5"
                    : "hover:bg-accent/30",
            )}
            onMouseLeave={() => setShowEmojiPicker(false)}
        >
            <Avatar initials={message.avatar} size="md" className="mt-0.5" />

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

                <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-primary">
                        {message.author}
                    </span>
                    <span className="text-xs text-muted-foreground">{message.timestamp}</span>
                </div>

                {vm.isEditing ? (
                    <div className="mt-1 flex gap-2">
                        <input
                            value={vm.editInput}
                            onChange={(e) => vm.setEditInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") vm.commitEdit()
                                if (e.key === "Escape") vm.cancelEdit()
                            }}
                            className="flex-1 border border-border bg-input px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            autoFocus
                        />
                        <button onClick={vm.commitEdit} className="text-xs text-primary hover:underline">
                            save
                        </button>
                        <button onClick={vm.cancelEdit} className="text-xs text-muted-foreground hover:underline">
                            cancel
                        </button>
                    </div>
                ) : (
                    <p className="text-sm leading-relaxed text-foreground">
                        {message.content}
                        {message.edited && (
                            <span className="ml-1 text-xs text-muted-foreground">(edited)</span>
                        )}
                    </p>
                )}

                {/* Reactions */}
                {message.reactions && message.reactions.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                        {message.reactions.map((r) => (
                            <button
                                key={r.emoji}
                                onClick={() => vm.handleReaction(r.emoji)}
                                className={cn(
                                    "flex items-center gap-1 border px-2 py-0.5 text-xs transition-colors",
                                    r.reacted
                                        ? "border-primary/50 bg-primary/10 text-primary"
                                        : "border-border bg-sidebar text-muted-foreground hover:border-primary/30",
                                )}
                            >
                                <span>{emojiMap[r.emoji] ?? r.emoji}</span>
                                <span>{r.count}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Hover action bar */}
            <div className="absolute -top-3 right-2 hidden items-center gap-0.5 border border-border bg-popover p-0.5 shadow-lg group-hover:flex">
                <IconButton
                    onPress={() => setShowEmojiPicker((v) => !v)}
                    aria-label="Add reaction"
                    className="p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                    <Smile className="h-4 w-4" />
                </IconButton>
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

            {/* Emoji quick-pick */}
            {showEmojiPicker && (
                <div className="absolute -top-10 right-2 z-50 flex items-center gap-1 border border-border bg-popover p-1.5 shadow-xl">
                    {quickEmojis.map((emoji) => (
                        <button
                            key={emoji}
                            onClick={() => {
                                vm.handleReaction(emojiMap[emoji] ?? emoji)
                                setShowEmojiPicker(false)
                            }}
                            className="p-1 text-base hover:bg-accent"
                        >
                            {emojiMap[emoji]}
                        </button>
                    ))}
                </div>
            )}

        </div>
    )
}
