import { TypingIndicator } from "@/presentation/molecules/TypingIndicator/TypingIndicator"
import { useConversationTypingViewModel } from "./ConversationTypingIndicator.viewmodel"

interface ConversationTypingIndicatorProps {
    conversationKey: string
    peerDisplayName: string | null
}

// Owns the typing subscription so a peer's keystrokes re-render only this
// row, not the page with its message list and composer. The row's height is
// reserved: typing starting and stopping must not resize the thread above it.
export function ConversationTypingIndicator({ conversationKey, peerDisplayName }: ConversationTypingIndicatorProps) {
    const typing = useConversationTypingViewModel(conversationKey, peerDisplayName)
    return (
        <div className="h-[25px] shrink-0">
            {typing && (
                <div className="animate-in fade-in-0 duration-150">
                    <TypingIndicator name={typing.name} />
                </div>
            )}
        </div>
    )
}
