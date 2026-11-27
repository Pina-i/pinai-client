import { useLocalSearchParams } from "expo-router"
import { ConversationPage } from "@/presentation/pages/conversation/conversation"

export default function Conversation() {
    const { id } = useLocalSearchParams<{ id: string }>()
    // Keyed: another conversation is a page of its own, its draft and history state with it.
    return (
        <ConversationPage
            key={id}
            conversationId={id}
        />
    )
}
