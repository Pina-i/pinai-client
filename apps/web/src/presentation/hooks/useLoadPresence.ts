import { useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAppStore } from "@/store/store"
import { getPresencePort, getSocialPort } from "@/ioc"
import { getPresenceSnapshotUseCase } from "@pinai/domain/usecases/presence/get-presence-snapshot.usecase"
import { getFriendsUseCase } from "@pinai/domain/usecases/social/get-friends.usecase"
import { actorUriToAddress } from "@pinai/domain/models/identity"
import type { PresenceState } from "@pinai/domain/models/presence"
import { friendsQueryKey } from "@/presentation/pages/home/FriendsPanel/FriendsPanel.viewmodel"

const PRESENCE_REFRESH_MS = 60_000

/**
 * Loads the initial presence snapshot for all friends + DM members and seeds
 * the store. Real-time deltas after this arrive over the WebSocket
 * (`presence_update`); the periodic refetch covers any missed events.
 */
export function useLoadPresence(): void {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const seedPresence = useAppStore((s) => s.seedPresence)

    // Share the friends query cache used by FriendsPanel (same key).
    const { data: friends } = useQuery({
        queryKey: friendsQueryKey(idpUrl ?? ""),
        queryFn: () => getFriendsUseCase(idpUrl!, accessToken!, getSocialPort()),
        enabled: !!accessToken && !!idpUrl,
    })

    const actorUris = useMemo(() => {
        const set = new Set<string>()
        friends?.forEach((f) => set.add(f.friend_actor_uri))
        localDmConvos.forEach((d) => {
            // DMs only — group conversations have many members and presence on
            // the sidebar would be ambiguous. `actorUri` is `null` for groups.
            if (d.kind === "dm" && d.actorUri) set.add(d.actorUri)
        })
        return Array.from(set).sort()
    }, [friends, localDmConvos])

    const actorUrisKey = actorUris.join(",")

    const { data: snapshot } = useQuery({
        queryKey: ["presence-snapshot", idpUrl, actorUrisKey],
        queryFn: () =>
            getPresenceSnapshotUseCase(idpUrl!, accessToken!, actorUris, getPresencePort()),
        enabled: !!accessToken && !!idpUrl && actorUris.length > 0,
        refetchInterval: PRESENCE_REFRESH_MS,
    })

    useEffect(() => {
        if (!snapshot) return
        const map: Record<string, PresenceState> = {}
        for (const entry of snapshot) {
            map[actorUriToAddress(entry.actorUri)] = entry.state
        }
        seedPresence(map)
    }, [snapshot, seedPresence])
}
