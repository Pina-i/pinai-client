import { useQuery } from "@tanstack/react-query"
import { getFriendsUseCase } from "@/domain/usecases/social/get-friends.usecase"
import { getSocialPort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { actorUriToAddress } from "@/domain/models/dm"

export const friendsQueryKey = (idpUrl: string) => ["friends", idpUrl] as const

export function useFriendsPanelViewModel() {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)

    const { data: friends = [], isLoading, error } = useQuery({
        queryKey: friendsQueryKey(idpUrl ?? ""),
        queryFn: () => getFriendsUseCase(idpUrl!, accessToken!, getSocialPort()),
        enabled: !!accessToken && !!idpUrl,
        select: (entries) =>
            entries.map((e) => ({
                id: e.friend_actor_uri,
                name: e.display_name ?? e.username ?? "unknown",
                address: actorUriToAddress(e.friend_actor_uri),
                avatarUrl: e.avatar_url,
                status: "offline" as const,
                activity: e.instance ?? "",
            })),
    })

    return { friends, isLoading, error: error instanceof Error ? error.message : null }
}
