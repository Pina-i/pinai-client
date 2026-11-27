import type { ConversationRow } from "@pinai/domain/models/conversation-list"
import type { DmConversationSummary } from "@pinai/domain/models/dm"
import { router } from "expo-router"
import { useCallback, useMemo } from "react"
import { refreshConversationList, useConversationList, useConversationListFailed } from "@/presentation/_libs/conversation-list"

export interface ListedConversation {
    row: ConversationRow
    summary: DmConversationSummary
}

/** Home's "Direct messages": the list as the IdP orders it, newest first. */
export function useHomeViewModel() {
    const list = useConversationList()
    const failed = useConversationListFailed()
    const conversations = useMemo<ListedConversation[] | null>(
        () => (list ? list.rows.map((row, i) => ({ row, summary: list.summaries[i] })) : null),
        [list]
    )
    const open = useCallback((id: string) => router.push({ pathname: "/conversation/[id]", params: { id } }), [])

    return {
        conversations,
        loading: list === null && !failed,
        failed: list === null && failed,
        retry: refreshConversationList,
        open,
    }
}
