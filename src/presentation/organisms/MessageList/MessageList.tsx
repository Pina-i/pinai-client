import type { ReactNode, RefObject } from "react"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { DateDivider, formatDateDividerLabel } from "@/presentation/molecules/DateDivider/DateDivider"
import type { Message } from "@/lib/types"
import { MessageItem } from "../MessageItem/MessageItem"

interface MessageListProps {
    messages: Message[]
    conversationKey: string
    recipientAddress: string
    onReply: (messageId: string) => void
    onRetry: (messageId: string) => void
    hasPendingIntent: (messageId: string) => boolean
    messagesEndRef: RefObject<HTMLDivElement | null>
}

export function MessageList({
    messages,
    conversationKey,
    recipientAddress,
    onReply,
    onRetry,
    hasPendingIntent,
    messagesEndRef,
}: MessageListProps) {
    const items: ReactNode[] = []
    let lastDayKey: string | undefined

    for (const msg of messages) {
        const date = new Date(msg.createdAt)
        const dayKey = date.toDateString()
        if (dayKey !== lastDayKey) {
            items.push(<DateDivider key={`divider-${dayKey}-${msg.id}`} label={formatDateDividerLabel(date)} />)
            lastDayKey = dayKey
        }
        items.push(
            <MessageItem
                key={msg.id}
                message={msg}
                conversationKey={conversationKey}
                recipientAddress={recipientAddress}
                onReply={onReply}
                onRetry={onRetry}
                hasPendingIntent={hasPendingIntent}
            />,
        )
    }

    return (
        <ScrollArea className="flex-1 px-4 py-4">
            <div className="flex flex-col gap-1">
                {items}
                <div ref={messagesEndRef} />
            </div>
        </ScrollArea>
    )
}
