import { PageTransition } from "@/presentation/atoms/page-transition/page-transition"
import { MessageInput } from "@/presentation/molecules/MessageInput/MessageInput"
import { MessageList } from "@/presentation/organisms/MessageList/MessageList"
import { useConversationPageViewModel } from "./ConversationPage.viewmodel"

interface ConversationPageProps {
    name: string
}

export function ConversationPage({ name }: ConversationPageProps) {
    const vm = useConversationPageViewModel(name)

    if (!vm.user) return null

    return (
        <PageTransition className="flex flex-1">
            <div className="flex flex-1 flex-col">
                <MessageList
                    messages={vm.messages}
                    conversationKey={vm.conversationKey}
                    onReply={vm.handleReply}
                    messagesEndRef={vm.messagesEndRef}
                />
                {vm.typingLabel && (
                    <div className="px-4 pb-1 text-xs italic text-muted-foreground" aria-live="polite">
                        {vm.typingLabel}
                    </div>
                )}
                <MessageInput
                    placeholder={`Message @${vm.name}`}
                    onSend={vm.sendMessage}
                    onType={vm.handleType}
                    replyTo={vm.replyingTo}
                    onCancelReply={vm.cancelReply}
                />
            </div>
        </PageTransition>
    )
}
