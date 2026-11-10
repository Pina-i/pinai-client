import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { getDmPort } from "@/ioc"
import { isWindowAttended, subscribeWindowAttention } from "@/presentation/_libs/window-attention"
import { dmConversationsQueryKey } from "@/presentation/hooks/useLoadDmConversations"
import { useAppStore } from "@/store/store"
import { needsMarkingRead } from "@pinai/domain/models/attention"
import type { DmConversationSummary } from "@pinai/domain/models/dm"
import { markConversationReadUseCase } from "@pinai/domain/usecases/dm/mark-conversation-read.usecase"

/** What arrived in the open conversation while the window wasn't attended is read once the user is back in it. */
export function useReadOnReturn(conversationId: string | null): void {
    const queryClient = useQueryClient()

    useEffect(() => {
        if (!conversationId) return
        // Only the step back into the window: opening a conversation is the page's own read.
        let attended = isWindowAttended()
        return subscribeWindowAttention(() => {
            const now = isWindowAttended()
            const returned = now && !attended
            attended = now
            if (!returned) return

            const { idpUrl, accessToken, dmUnread, clearDmUnread } = useAppStore.getState()
            if (!idpUrl || !accessToken) return
            const queryKey = dmConversationsQueryKey(idpUrl)
            const listed = queryClient
                .getQueryData<DmConversationSummary[]>(queryKey)
                ?.find((summary) => summary.conversation_id === conversationId)?.unread_count
            if (!needsMarkingRead(dmUnread[conversationId] ?? 0, listed ?? 0)) return

            clearDmUnread(conversationId)
            markConversationReadUseCase({ idpUrl, accessToken }, conversationId, {
                port: getDmPort(),
                refreshList: () => void queryClient.invalidateQueries({ queryKey }),
            }).catch((e) => {
                // eslint-disable-next-line no-console
                console.warn("markConversationRead failed:", e)
            })
        })
    }, [conversationId, queryClient])
}
