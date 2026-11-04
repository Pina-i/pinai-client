import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { deviceListKey } from "@pinai/domain/models/device"
import type { ConversationId } from "@pinai/domain/models/e2ee"
import { oneAtATime, syncOwnGroupsUseCase } from "@pinai/domain/usecases/e2ee/sync-own-groups.usecase"
import { getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { devicesQueryKey } from "@/presentation/hooks/useDevices"
import { useAppStore } from "@/store/store"

/**
 * Keeps the groups this device holds keys for in step: the commits it missed while away, the
 * leaves it doesn't trust committed out, then the user's approved devices they lack. It runs on
 * every device-list refresh, so a device signed in while this one was offline is caught when this
 * one comes back; the WS `device_joined` and `device_approved` pushes only refresh the list, and
 * the run reads it again itself before judging anyone. One run at a time, page-wide.
 */
const sync = oneAtATime(syncOwnGroupsUseCase)

export function useDeviceFanout(): {
    onDeviceListChanged: () => void
} {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const queryClient = useQueryClient()

    // Same queryKey as `useDevices` — both queryFns must agree on shape
    // (the unwrapped device array) so TanStack's per-key dedup doesn't
    // serve one consumer a value the other can't read.
    const { data: devices } = useQuery({
        queryKey: devicesQueryKey(idpUrl ?? ""),
        queryFn: async () => {
            const res = await getDeviceDirectoryPort().listDevices(idpUrl!, useAppStore.getState().accessToken!)
            return res.devices
        },
        enabled: !!idpUrl && signedIn,
    })

    // The ids alone: the list's rows change on every typing-status flip.
    const conversationIds = localDmConvos.map((c) => c.id).join(",")
    // A refetch on each focus brings new arrays of the same bytes: only what a review reads counts.
    const listKey = useMemo(() => (devices ? deviceListKey(devices) : null), [devices])
    // A group this device founds or joins changes neither the device list nor, often, the ids.
    const [groupsHeld, setGroupsHeld] = useState(0)
    useEffect(() => getE2eePort().onGroupHeld(() => setGroupsHeld((n) => n + 1)), [])
    // A registration changed this device's row, and its leaves have a new credential to take.
    useEffect(
        () =>
            getE2eePort().onDeviceRegistered(() => {
                if (idpUrl) void queryClient.invalidateQueries({ queryKey: devicesQueryKey(idpUrl) })
            }),
        [idpUrl, queryClient],
    )

    useEffect(() => {
        const accessToken = useAppStore.getState().accessToken
        if (listKey === null || !idpUrl || !accessToken || !actorUri) return
        void (async () => {
            // With no conversation, the device list is still reviewed: revocations kept, devices announced.
            const { failed, reviewFailure } = await sync(
                idpUrl,
                accessToken,
                actorUri,
                conversationIds ? (conversationIds.split(",") as ConversationId[]) : [],
                { e2ee: getE2eePort(), deviceDirectory: getDeviceDirectoryPort() },
            )
            if (reviewFailure !== undefined) {
                // eslint-disable-next-line no-console
                console.warn("[fanout] reviewing the device list failed", reviewFailure)
            }
            for (const { conversationId, error } of failed) {
                // eslint-disable-next-line no-console
                console.warn("[fanout] keeping a group in step failed", conversationId, error)
            }
        })()
    }, [listKey, idpUrl, signedIn, actorUri, conversationIds, groupsHeld])

    const onDeviceListChanged = useCallback(() => {
        if (!idpUrl) return
        // The refreshed list runs the fanout above.
        void queryClient.invalidateQueries({ queryKey: devicesQueryKey(idpUrl) })
    }, [idpUrl, queryClient])

    return { onDeviceListChanged }
}
