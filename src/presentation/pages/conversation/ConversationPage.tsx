import { PageTransition } from "@/presentation/atoms/page-transition/page-transition"
import { MessageInput } from "../home/MessageInput/MessageInput"
import { MessageList } from "../home/MessageList/MessageList"
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
                    currentUsername={vm.user.display_name ?? vm.user.preferred_username}
                    onReaction={vm.handleReaction}
                    onDelete={vm.handleDeleteMessage}
                    onEdit={vm.handleEditMessage}
                    onUserClick={vm.handleUserClick}
                    messagesEndRef={vm.messagesEndRef}
                />
                <MessageInput
                    placeholder={`Message @${vm.name}`}
                    onSend={vm.sendMessage}
                />
            </div>
        </PageTransition>
    )
}
