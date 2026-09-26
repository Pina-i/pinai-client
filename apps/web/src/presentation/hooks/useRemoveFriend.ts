import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { getSocialPort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { getFriendsUseCase } from "@pinai/domain/usecases/social/get-friends.usecase"
import { removeFriendUseCase } from "@pinai/domain/usecases/social/remove-friend.usecase"
import { friendsQueryKey } from "@/presentation/pages/home/FriendsPanel/FriendsPanel.viewmodel"
import { dmConversationsQueryKey } from "@/presentation/hooks/useLoadDmConversations"

/**
 * Removes a friend and refreshes what depends on the friendship. The DM
 * conversation is kept, so the DM list is only refetched, never pruned.
 */
export function useRemoveFriend() {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const queryClient = useQueryClient()
    const [isRemoving, setIsRemoving] = useState(false)

    /** Resolves to whether the friend was removed; failures surface as a toast. */
    async function removeFriend(actorUri: string, name: string): Promise<boolean> {
        if (!accessToken || !idpUrl) return false
        setIsRemoving(true)
        try {
            await removeFriendUseCase(idpUrl, accessToken, actorUri, getSocialPort())
            toast.success(`${name} was removed from your friends`)
            void queryClient.invalidateQueries({ queryKey: friendsQueryKey(idpUrl) })
            void queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) })
            return true
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Something went wrong")
            return false
        } finally {
            setIsRemoving(false)
        }
    }

    return { removeFriend, isRemoving }
}

/** Whether `actorUri` is an accepted friend, read from the shared friends query. */
export function useIsFriend(actorUri: string | null): boolean {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)

    const { data: isFriend = false } = useQuery({
        queryKey: friendsQueryKey(idpUrl ?? ""),
        queryFn: () => getFriendsUseCase(idpUrl!, accessToken!, getSocialPort()),
        enabled: !!accessToken && !!idpUrl && !!actorUri,
        select: (friends) => friends.some((f) => f.friend_actor_uri === actorUri),
    })

    return isFriend
}
