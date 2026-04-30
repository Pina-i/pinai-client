import { FileImage, Reply, Send, Smile, X } from "lucide-react"
import { useState } from "react"
import { Input, TextField } from "react-aria-components"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { EmojiPicker } from "@/presentation/molecules/EmojiPicker/EmojiPicker"
import { Popover } from "@/presentation/molecules/Popover/Popover"
import { cn } from "@/presentation/_libs/utils"

interface MessageInputProps {
    placeholder: string
    onSend: (content: string) => void
    /** Fired on each keystroke; consumer is responsible for rate-limiting (e.g. typing indicator). */
    onType?: () => void
    replyTo?: { id: string; content: string; author: string } | null
    onCancelReply?: () => void
}

export function MessageInput({ placeholder, onSend, onType, replyTo, onCancelReply }: MessageInputProps) {
    const [value, setValue] = useState("")

    function handleSend() {
        if (!value.trim()) return
        onSend(value.trim())
        setValue("")
    }

    function handleChange(next: string) {
        setValue(next)
        if (next.trim().length > 0) onType?.()
    }

    function handleEmojiSelect(emoji: string) {
        setValue((prev) => prev + emoji)
        onType?.()
    }

    return (
        <div className="shrink-0 px-6 pb-5">
            {replyTo && (
                <div className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-chat bg-accent/40 px-3 py-2 text-xs text-muted-foreground">
                    <Reply className="h-3 w-3 shrink-0" />
                    <span className="font-medium text-foreground">{replyTo.author}</span>
                    <span className="flex-1 truncate">{replyTo.content}</span>
                    <IconButton
                        aria-label="Cancel reply"
                        onPress={onCancelReply}
                        className="shrink-0 hover:text-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </IconButton>
                </div>
            )}
            <div className="rounded-lg border border-border-strong bg-card px-2.5 pt-2 pb-2">
                <div className="flex items-center gap-2">
                    <Popover
                        placement="top start"
                        offset={8}
                        trigger={
                            <IconButton aria-label="Emoji" className="text-muted-foreground hover:text-foreground">
                                <Smile className="h-5 w-5" />
                            </IconButton>
                        }
                        className="overflow-hidden rounded-lg border border-border-strong bg-popover shadow-xl"
                    >
                        <EmojiPicker onEmojiSelect={handleEmojiSelect} />
                    </Popover>
                    <TextField
                        value={value}
                        onChange={handleChange}
                        aria-label="Message"
                        className="flex-1"
                    >
                        <Input
                            placeholder={placeholder}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleSend()
                            }}
                            className="w-full bg-transparent py-1 text-[13.5px] text-foreground placeholder:text-muted-foreground outline-none"
                        />
                    </TextField>
                    <IconButton aria-label="Attach image" className="text-muted-foreground hover:text-foreground">
                        <FileImage className="h-5 w-5" />
                    </IconButton>
                    <IconButton
                        onPress={handleSend}
                        aria-label="Send message"
                        isDisabled={!value.trim()}
                        className={cn(
                            "h-7 w-8 rounded-md transition-opacity",
                            value.trim()
                                ? "bg-chat text-primary-foreground hover:opacity-90"
                                : "bg-accent text-muted-foreground opacity-60",
                        )}
                    >
                        <Send className="h-4 w-4" />
                    </IconButton>
                </div>
            </div>
            <div className="mt-1.5 flex gap-3 px-1 mono-eyebrow">
                <span>⏎ send</span>
                <span>⇧⏎ new line</span>
                <span>/ commands</span>
                <span className="ml-auto">E2E encrypted</span>
            </div>
        </div>
    )
}
