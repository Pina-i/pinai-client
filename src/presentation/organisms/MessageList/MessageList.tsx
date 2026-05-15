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

/** Gap above which we restart a sequence even when the author is the same. */
const SEQUENCE_GAP_MS = 5 * 60 * 1000

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
    let prevAuthorAddress: string | undefined
    let prevCreatedAt: number | undefined

    for (const msg of messages) {
        const date = new Date(msg.createdAt)
        const dayKey = date.toDateString()
        const dayChanged = dayKey !== lastDayKey
        if (dayChanged) {
            items.push(<DateDivider key={`divider-${dayKey}-${msg.id}`} label={formatDateDividerLabel(date)} />)
            lastDayKey = dayKey
            prevAuthorAddress = undefined
            prevCreatedAt = undefined
        }

        const sameAuthor = prevAuthorAddress != null && prevAuthorAddress === msg.authorAddress
        const within = prevCreatedAt != null && date.getTime() - prevCreatedAt <= SEQUENCE_GAP_MS
        const first = !sameAuthor || !within

        items.push(
            <MessageItem
                key={msg.id}
                message={msg}
                conversationKey={conversationKey}
                recipientAddress={recipientAddress}
                first={first}
                onReply={onReply}
                onRetry={onRetry}
                hasPendingIntent={hasPendingIntent}
            />,
        )

        prevAuthorAddress = msg.authorAddress
        prevCreatedAt = date.getTime()
    }

    return (
        <ScrollArea className="flex-1 px-7 py-7">
            <div className="flex flex-col gap-[2px]">
                {items}
                <div ref={messagesEndRef} />
            </div>
        </ScrollArea>
    )
}
