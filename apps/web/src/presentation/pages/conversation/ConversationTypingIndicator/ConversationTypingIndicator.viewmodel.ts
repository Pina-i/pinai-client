import { useMemo } from "react"
import { actorUriToAddress } from "@pinai/domain/models/identity"
import { useAppStore } from "@/store/store"

/** Who is typing in this conversation, other than me; `null` when nobody is. */
export function useConversationTypingViewModel(conversationKey: string, peerDisplayName: string | null) {
    const entries = useAppStore((s) => s.typingByConversation[conversationKey])
    const ownAddress = useAppStore((s) => s.user?.address)

    return useMemo<{ name: string } | null>(() => {
        const others = (entries ?? []).filter((t) => actorUriToAddress(t.actorUri) !== ownAddress)
        if (others.length === 0) return null
        if (others.length === 1) return { name: peerDisplayName ?? "Someone" }
        return { name: `${others.length} people` }
    }, [entries, ownAddress, peerDisplayName])
}
