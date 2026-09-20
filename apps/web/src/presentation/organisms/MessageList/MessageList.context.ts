import { createContext } from "react"

/**
 * Which message currently has its reaction picker open. Lives in context
 * because `MessageItem` is memoised — a prop threaded through would never
 * update, while context re-renders every consumer.
 */
export const ReactionPickerContext = createContext<{ openMessageId: string | null }>({
    openMessageId: null,
})
