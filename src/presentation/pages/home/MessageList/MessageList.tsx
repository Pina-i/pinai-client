import { Copy, Edit, MoreHorizontal, Pin, Reply, Smile, Trash2 } from "lucide-react"
import { useState, type RefObject } from "react"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { cn } from "@/presentation/_libs/utils"
import type { Message } from "@/lib/types"

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

interface MessageListProps {
    messages: Message[]
    currentUsername: string
    onReaction: (messageId: string, emoji: string) => void
    onDelete: (messageId: string) => void
    onEdit: (messageId: string, content: string) => void
    onUserClick: (author: string) => void
    messagesEndRef: RefObject<HTMLDivElement | null>
}

export function MessageList({
    messages,
    currentUsername,
    onReaction,
    onDelete,
    onEdit,
    onUserClick,
    messagesEndRef,
}: MessageListProps) {
    const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null)
    const [showMessageActions, setShowMessageActions] = useState<string | null>(null)
    const [editingMessage, setEditingMessage] = useState<string | null>(null)
    const [editInput, setEditInput] = useState("")

    function commitEdit(messageId: string) {
        if (!editInput.trim()) return
        onEdit(messageId, editInput.trim())
        setEditingMessage(null)
        setEditInput("")
    }

    return (
        <ScrollArea className="flex-1 px-4 py-4">
            <div className="flex flex-col gap-1">
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className="group relative flex gap-4 px-2 py-1.5 hover:bg-accent/30"
                        onMouseLeave={() => {
                            setShowMessageActions(null)
                            setShowEmojiPicker(null)
                        }}
                    >
                        <Avatar initials={msg.avatar} color={msg.color} size="md" className="mt-0.5" />

                        <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                                <button
                                    onClick={() => onUserClick(msg.author)}
                                    className="font-semibold hover:underline"
                                    style={{ color: msg.color }}
                                >
                                    {msg.author}
                                </button>
                                <span className="text-xs text-muted-foreground">{msg.timestamp}</span>
                            </div>

                            {editingMessage === msg.id ? (
                                <div className="mt-1 flex gap-2">
                                    <input
                                        value={editInput}
                                        onChange={(e) => setEditInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") commitEdit(msg.id)
                                            if (e.key === "Escape") setEditingMessage(null)
                                        }}
                                        className="flex-1 border border-border bg-input px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                        autoFocus
                                    />
                                    <button onClick={() => commitEdit(msg.id)} className="text-xs text-primary hover:underline">
                                        save
                                    </button>
                                    <button
                                        onClick={() => setEditingMessage(null)}
                                        className="text-xs text-muted-foreground hover:underline"
                                    >
                                        cancel
                                    </button>
                                </div>
                            ) : (
                                <p className="text-sm leading-relaxed text-foreground">{msg.content}</p>
                            )}

                            {/* Reactions */}
                            {msg.reactions && msg.reactions.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {msg.reactions.map((r) => (
                                        <button
                                            key={r.emoji}
                                            onClick={() => onReaction(msg.id, r.emoji)}
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
                                onPress={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)}
                                aria-label="Add reaction"
                                className="p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                <Smile className="h-4 w-4" />
                            </IconButton>
                            {msg.author === currentUsername && (
                                <IconButton
                                    onPress={() => {
                                        setEditingMessage(msg.id)
                                        setEditInput(msg.content)
                                    }}
                                    aria-label="Edit message"
                                    className="p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                >
                                    <Edit className="h-4 w-4" />
                                </IconButton>
                            )}
                            <IconButton
                                onPress={() => setShowMessageActions(showMessageActions === msg.id ? null : msg.id)}
                                aria-label="More options"
                                className="p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                <MoreHorizontal className="h-4 w-4" />
                            </IconButton>
                        </div>

                        {/* Emoji quick-pick */}
                        {showEmojiPicker === msg.id && (
                            <div className="absolute -top-10 right-2 z-50 flex items-center gap-1 border border-border bg-popover p-1.5 shadow-xl">
                                {quickEmojis.map((emoji) => (
                                    <button
                                        key={emoji}
                                        onClick={() => {
                                            onReaction(msg.id, emoji)
                                            setShowEmojiPicker(null)
                                        }}
                                        className="p-1 text-base hover:bg-accent"
                                    >
                                        {emojiMap[emoji]}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Message context menu */}
                        {showMessageActions === msg.id && (
                            <div className="absolute right-2 top-5 z-50 w-44 border border-border bg-popover p-1 shadow-xl">
                                <button className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                                    <Reply className="h-4 w-4" /> Reply
                                </button>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(msg.content)
                                        setShowMessageActions(null)
                                    }}
                                    className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                                >
                                    <Copy className="h-4 w-4" /> Copy Text
                                </button>
                                <button className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                                    <Pin className="h-4 w-4" /> Pin Message
                                </button>
                                {msg.author === currentUsername && (
                                    <button
                                        onClick={() => {
                                            onDelete(msg.id)
                                            setShowMessageActions(null)
                                        }}
                                        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                                    >
                                        <Trash2 className="h-4 w-4" /> Delete
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
        </ScrollArea>
    )
}
