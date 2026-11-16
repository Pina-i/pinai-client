import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { getGroupPort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { mayLeaveGroup } from "@pinai/domain/models/group"
import { dmConversationsQueryKey } from "@/presentation/hooks/useLoadDmConversations"
import { groupMembersQueryKey } from "@/presentation/hooks/useGroupMembers"

/**
 * The user leaving a group. Resolves to whether they left; a refusal — the last admin's, read on
 * the roster before asking the IdP, or the IdP's own — surfaces as a toast.
 */
export function useLeaveGroup() {
    const queryClient = useQueryClient()
    const navigate = useNavigate()
    const switchToDms = useAppStore((s) => s.switchToDms)
    const [isPending, setIsPending] = useState(false)

    async function leave(conversationId: string): Promise<boolean> {
        const { accessToken, idpUrl, user } = useAppStore.getState()
        const me = user?.actor_uri
        if (!accessToken || !idpUrl || !me || isPending) return false
        setIsPending(true)
        try {
            const members = await queryClient.ensureQueryData({
                queryKey: groupMembersQueryKey(conversationId),
                queryFn: () => getGroupPort().listMembers(idpUrl, accessToken, conversationId),
            })
            if (!mayLeaveGroup(members, me)) {
                toast.error("You're this group's only admin. Make another member admin before you leave.")
                return false
            }
            await getGroupPort().removeMember(idpUrl, accessToken, conversationId, me)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Something went wrong")
            return false
        } finally {
            setIsPending(false)
        }
        void queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) })
        if (useAppStore.getState().activeDm === conversationId) {
            switchToDms()
            void navigate({ to: "/home" })
        }
        return true
    }

    return { leave, isPending }
}
