import type { RefObject } from "react"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import type { Message } from "@/lib/types"
import { MessageItem } from "../MessageItem/MessageItem"

interface MessageListProps {
    messages: Message[]
    conversationKey: string
    onReply: (messageId: string) => void
    messagesEndRef: RefObject<HTMLDivElement | null>
}

export function MessageList({ messages, conversationKey, onReply, messagesEndRef }: MessageListProps) {
    return (
        <ScrollArea className="flex-1 px-4 py-4">
            <div className="flex flex-col gap-1">
                {messages.map((msg) => (
                    <MessageItem
                        key={msg.id}
                        message={msg}
                        conversationKey={conversationKey}
                        onReply={onReply}
                    />
                ))}
                <div ref={messagesEndRef} />
            </div>
        </ScrollArea>
    )
}
