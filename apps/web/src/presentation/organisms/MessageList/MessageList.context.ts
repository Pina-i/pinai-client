import { createContext } from "react"

/**
 * Which message currently has its reaction picker open. Lives in context
 * because `MessageItem` is memoised — a prop threaded through would never
 * update, while context re-renders every consumer.
 */
export const ReactionPickerContext = createContext<{ openMessageId: string | null }>({
    openMessageId: null,
})

/** A message another row links to: enough to name it and scroll to it. */
export interface LinkedMessage {
    id: string
    timestamp: string
}

/**
 * Links between rows of the thread: the copy an undelivered message was sent
 * again as, and the jump that scrolls to a message and flashes it. Context for
 * the same reason as the reaction picker.
 */
export const MessageThreadContext = createContext<{
    resentCopies: ReadonlyMap<string, LinkedMessage>
    flashedMessageId: string | null
    jumpToMessage: (messageId: string) => void
}>({
    resentCopies: new Map(),
    flashedMessageId: null,
    jumpToMessage: () => {},
})
