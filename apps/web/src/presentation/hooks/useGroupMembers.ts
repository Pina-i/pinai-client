import { useQuery } from "@tanstack/react-query"
import { getGroupPort } from "@/ioc"
import { useAppStore } from "@/store/store"

export const groupMembersQueryKey = (conversationId: string) => ["group-members", conversationId] as const

export function useGroupMembers(conversationId: string) {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    return useQuery({
        queryKey: groupMembersQueryKey(conversationId),
        queryFn: () => getGroupPort().listMembers(idpUrl!, accessToken!, conversationId),
        enabled: !!idpUrl && !!accessToken && !!conversationId,
    })
}
