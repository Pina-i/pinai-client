import { useQuery } from "@tanstack/react-query"
import type { ProfileCard } from "@pinai/domain/models/profile"
import { getProfileCardUseCase } from "@pinai/domain/usecases/user/get-profile-card.usecase"
import { getUserPort } from "@/ioc"
import { useAppStore } from "@/store/store"

export const profileCardsQueryKey = (idpUrl: string) => ["profile-card", idpUrl] as const
export const profileCardQueryKey = (idpUrl: string, actorUri: string) =>
    [...profileCardsQueryKey(idpUrl), actorUri] as const

/** What the IdP shows the viewer of `actorUri`: `undefined` while it is read, `null` for nothing. */
export function useProfileCard(actorUri: string): ProfileCard | null | undefined {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)

    const { data } = useQuery({
        queryKey: profileCardQueryKey(idpUrl ?? "", actorUri),
        queryFn: () => getProfileCardUseCase(idpUrl!, accessToken!, actorUri, getUserPort()),
        enabled: !!accessToken && !!idpUrl,
    })

    return data
}
