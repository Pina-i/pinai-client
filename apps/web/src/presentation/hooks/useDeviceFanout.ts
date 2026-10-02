import { useCallback, useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import type { ConversationId } from "@pinai/domain/models/e2ee"
import type { DeviceJoinedPayload } from "@pinai/domain/models/ws"
import { syncOwnGroupsUseCase } from "@pinai/domain/usecases/e2ee/sync-own-groups.usecase"
import { getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { devicesQueryKey } from "@/presentation/hooks/useDevices"
import { useAppStore } from "@/store/store"

/**
 * Keeps the groups this device holds keys for in step: the commits it missed while away, then
 * this user's other devices they lack. It runs on every device-list refresh, so a device signed
 * in while this one was offline is caught when this one comes back; the WS `device_joined` push
 * only refreshes the list.
 */
export function useDeviceFanout(): {
    onDeviceJoined: (e: DeviceJoinedPayload) => void
} {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const accessToken = useAppStore((s) => s.accessToken)
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const queryClient = useQueryClient()

    // Same queryKey as `useDevices` — both queryFns must agree on shape
    // (the unwrapped device array) so TanStack's per-key dedup doesn't
    // serve one consumer a value the other can't read.
    const { data: devices } = useQuery({
        queryKey: devicesQueryKey(idpUrl ?? ""),
        queryFn: async () => {
            const res = await getDeviceDirectoryPort().listDevices(idpUrl!, accessToken!)
            return res.devices
        },
        enabled: !!idpUrl && !!accessToken,
    })

    // The ids alone: the list's rows change on every typing-status flip.
    const conversationIds = localDmConvos.map((c) => c.id).join(",")
    // A group this device founds or joins changes neither the device list nor, often, the ids.
    const [groupsHeld, setGroupsHeld] = useState(0)
    useEffect(() => getE2eePort().onGroupHeld(() => setGroupsHeld((n) => n + 1)), [])

    useEffect(() => {
        if (!devices || !idpUrl || !accessToken || !conversationIds) return
        const e2ee = getE2eePort()
        let cancelled = false
        void (async () => {
            const thisDevice = await e2ee.getDeviceId()
            if (cancelled) return
            const { failed } = await syncOwnGroupsUseCase(
                idpUrl,
                accessToken,
                thisDevice,
                devices,
                conversationIds.split(",") as ConversationId[],
                e2ee,
            )
            for (const { conversationId, error } of failed) {
                // eslint-disable-next-line no-console
                console.warn("[fanout] keeping a group in step failed", conversationId, error)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [devices, idpUrl, accessToken, conversationIds, groupsHeld])

    const onDeviceJoined = useCallback(() => {
        if (!idpUrl) return
        // The refreshed list, with the new device in it, runs the fanout above.
        void queryClient.invalidateQueries({ queryKey: devicesQueryKey(idpUrl) })
    }, [idpUrl, queryClient])

    return { onDeviceJoined }
}
