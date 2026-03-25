import { useQuery } from "@tanstack/react-query"
import { useAppStore } from "@/store/store"
import { getDmConversationsUseCase } from "@/domain/usecases/dm/get-dm-conversations.usecase"
import { getDmPort } from "@/ioc"
import { actorUriToAddress } from "@/domain/models/dm"
import type { DmConversation } from "@/lib/types"
import { useEffect } from "react"

function colorFromString(s: string): string {
    let hash = 0
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
    return `hsl(${Math.abs(hash) % 360}, 65%, 60%)`
}

export const dmConversationsQueryKey = (idpUrl: string) => ["dm-conversations", idpUrl] as const

/**
 * Fetches the DM conversation list via TanStack Query and seeds the Zustand store.
 * Called once from the authenticated layout so the sidebar populates after login.
 * Invalidate the query key from the WS hook to trigger a re-fetch on new messages.
 */
export function useLoadDmConversations(): void {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const setDmConversations = useAppStore((s) => s.setDmConversations)
    const seedDmUnread = useAppStore((s) => s.seedDmUnread)

    const { data: summaries } = useQuery({
        queryKey: dmConversationsQueryKey(idpUrl ?? ""),
        queryFn: () => getDmConversationsUseCase(idpUrl!, accessToken!, getDmPort()),
        enabled: !!accessToken && !!idpUrl,
    })

    useEffect(() => {
        if (!summaries) return

        const convos: DmConversation[] = summaries.map((summary) => {
            const firstMember = summary.members[0]
            const address = firstMember ? actorUriToAddress(firstMember.actorUri) : summary.conversation_id
            const displayName = summary.kind === "dm"
                ? (firstMember?.displayName ?? address.split("@")[0] ?? address)
                : (summary.name ?? summary.members.map((m) => m.displayName ?? "?").join(", "))
            return {
                id: summary.conversation_id,
                kind: summary.kind,
                groupName: summary.name,
                displayName,
                address,
                avatar: displayName.slice(0, 2).toUpperCase(),
                color: colorFromString(address),
                status: "offline" as const,
                lastMessage: summary.last_message_preview ?? "",
                unread: 0,
            }
        })
        setDmConversations(convos)

        const unreadCounts: Record<string, number> = {}
        summaries.forEach((summary) => {
            if (summary.unread_count > 0) {
                unreadCounts[summary.conversation_id] = summary.unread_count
            }
        })
        seedDmUnread(unreadCounts)
    }, [summaries, setDmConversations, seedDmUnread])
}
