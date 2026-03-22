import { FileImage, Gift, Plus, Reply, Send, Smile, X } from "lucide-react"
import { useState } from "react"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { cn } from "@/presentation/_libs/utils"

interface MessageInputProps {
    placeholder: string
    onSend: (content: string) => void
    replyTo?: { id: string; content: string; author: string } | null
    onCancelReply?: () => void
}

export function MessageInput({ placeholder, onSend, replyTo, onCancelReply }: MessageInputProps) {
    const [value, setValue] = useState("")

    function handleSend() {
        if (!value.trim()) return
        onSend(value.trim())
        setValue("")
    }

    return (
        <div className="shrink-0 px-4 pb-6">
            {replyTo && (
                <div className="flex items-center gap-2 border-l-2 border-primary bg-accent/50 px-4 py-2 text-xs text-muted-foreground">
                    <Reply className="h-3 w-3 shrink-0" />
                    <span className="font-medium text-foreground">{replyTo.author}</span>
                    <span className="flex-1 truncate">{replyTo.content}</span>
                    <button onClick={onCancelReply} className="shrink-0 hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}
            <div className="flex items-center gap-2 bg-accent px-4 py-2.5">
                <IconButton aria-label="Attach file" className="text-muted-foreground hover:text-foreground">
                    <Plus className="h-5 w-5" />
                </IconButton>
                <input
                    type="text"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handleSend()
                    }}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <div className="flex items-center gap-2">
                    <IconButton aria-label="Send gift" className="text-muted-foreground hover:text-foreground">
                        <Gift className="h-5 w-5" />
                    </IconButton>
                    <IconButton aria-label="Attach image" className="text-muted-foreground hover:text-foreground">
                        <FileImage className="h-5 w-5" />
                    </IconButton>
                    <IconButton aria-label="Emoji" className="text-muted-foreground hover:text-foreground">
                        <Smile className="h-5 w-5" />
                    </IconButton>
                    <IconButton
                        onPress={handleSend}
                        aria-label="Send message"
                        className={cn(
                            "transition-colors",
                            value.trim() ? "text-primary hover:text-primary/80" : "text-muted-foreground",
                        )}
                    >
                        <Send className="h-5 w-5" />
                    </IconButton>
                </div>
            </div>
        </div>
    )
}
