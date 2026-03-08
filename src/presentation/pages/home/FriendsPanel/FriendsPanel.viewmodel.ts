import { useQuery } from "@tanstack/react-query"
import { getFriendsUseCase } from "@/domain/usecases/social/get-friends.usecase"
import { getSocialPort } from "@/ioc"
import { useAppStore } from "@/store/store"

export const friendsQueryKey = (idpUrl: string) => ["friends", idpUrl] as const

export function useFriendsPanelViewModel() {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)

    const { data: friends = [], isLoading, error } = useQuery({
        queryKey: friendsQueryKey(idpUrl ?? ""),
        queryFn: () => getFriendsUseCase(idpUrl!, accessToken!, getSocialPort()),
        enabled: !!accessToken && !!idpUrl,
        select: (users) =>
            users.map((u) => ({
                id: u.address,
                name: u.username,
                avatarUrl: u.avatar_url,
                status: u.status ?? ("offline" as const),
                activity: "",
            })),
    })

    return { friends, isLoading, error: error instanceof Error ? error.message : null }
}
