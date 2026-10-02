import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { getE2eePort, getGroupPort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { dismissGroupUseCase } from "@pinai/domain/usecases/e2ee/dismiss-group.usecase"
import { dmConversationsQueryKey } from "@/presentation/hooks/useLoadDmConversations"

/**
 * Clears a group the user was removed from: off their list, its keys and its cached timeline off
 * this device. Resolves to whether it worked; a failure surfaces as a toast.
 */
export function useDismissGroup() {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const forgetConversation = useAppStore((s) => s.forgetConversation)
    const clearDmUnread = useAppStore((s) => s.clearDmUnread)
    const queryClient = useQueryClient()
    const navigate = useNavigate()
    const [isPending, setIsPending] = useState(false)

    async function dismiss(conversationId: string): Promise<boolean> {
        if (!accessToken || !idpUrl) return false
        setIsPending(true)
        try {
            await dismissGroupUseCase(idpUrl, accessToken, conversationId, getGroupPort(), getE2eePort())
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Something went wrong")
            return false
        } finally {
            setIsPending(false)
        }
        // Away first, so the open page never renders the emptied timeline.
        if (useAppStore.getState().activeDm === conversationId) await navigate({ to: "/home" })
        forgetConversation(conversationId)
        clearDmUnread(conversationId)
        void queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) })
        return true
    }

    return { dismiss, isPending }
}
