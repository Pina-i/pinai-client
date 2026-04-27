import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { getFriendsUseCase } from "@/domain/usecases/social/get-friends.usecase"
import { getSocialPort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { actorUriToAddress } from "@/domain/models/dm"
import { presenceToUserStatus } from "@/domain/models/presence"

export const friendsQueryKey = (idpUrl: string) => ["friends", idpUrl] as const

export function useFriendsPanelViewModel() {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const presenceByAddress = useAppStore((s) => s.presenceByAddress)

    const { data: rawFriends = [], isLoading, error } = useQuery({
        queryKey: friendsQueryKey(idpUrl ?? ""),
        queryFn: () => getFriendsUseCase(idpUrl!, accessToken!, getSocialPort()),
        enabled: !!accessToken && !!idpUrl,
    })

    const friends = useMemo(
        () =>
            rawFriends.map((e) => {
                const address = actorUriToAddress(e.friend_actor_uri)
                return {
                    id: e.friend_actor_uri,
                    name: e.display_name ?? e.username ?? "unknown",
                    address,
                    avatarUrl: e.avatar_url,
                    status: presenceToUserStatus(presenceByAddress[address]),
                    activity: e.instance ?? "",
                }
            }),
        [rawFriends, presenceByAddress],
    )

    return { friends, isLoading, error: error instanceof Error ? error.message : null }
}
