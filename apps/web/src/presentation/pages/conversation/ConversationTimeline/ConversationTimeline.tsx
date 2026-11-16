import { MessageList, type MessageListProps } from "@/presentation/organisms/MessageList/MessageList"
import { MessageListSkeleton } from "@/presentation/molecules/MessageListSkeleton/MessageListSkeleton"
import { cn } from "@/presentation/_libs/utils"
import { useConversationTimelineViewModel } from "./ConversationTimeline.viewmodel"

interface ConversationTimelineProps extends Omit<MessageListProps, "onSettle"> {
    /** The conversation's history hasn't answered yet. */
    isLoading: boolean
}

/** Keyed by the conversation, so switching mounts a fresh one. */
export function ConversationTimeline({ messages, notices, isLoading, ...listProps }: ConversationTimelineProps) {
    const vm = useConversationTimelineViewModel(messages, notices, isLoading)

    return (
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div
                aria-busy={!vm.isRevealed}
                className={cn(
                    "flex min-h-0 min-w-0 flex-1 flex-col transition-opacity duration-150 ease-out motion-reduce:transition-none",
                    !vm.isRevealed && "opacity-0",
                )}
            >
                <MessageList messages={vm.messages} notices={vm.notices} onSettle={vm.settle} {...listProps} />
            </div>
            {vm.showSkeleton && (
                <div
                    className={cn(
                        "pointer-events-none absolute inset-0 transition-opacity duration-150 ease-out",
                        "motion-safe:animate-[pn-fade-in_150ms_ease-out] motion-reduce:transition-none",
                        vm.isRevealed && "opacity-0",
                    )}
                >
                    <MessageListSkeleton />
                </div>
            )}
        </div>
    )
}
