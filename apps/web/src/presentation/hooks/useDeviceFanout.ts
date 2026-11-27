import { useCallback, useEffect, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import type { ConversationId } from "@pinai/domain/models/e2ee"
import { oneAtATime } from "@pinai/domain/lib/one-at-a-time"
import { DeviceFanout } from "@pinai/domain/usecases/e2ee/device-fanout.usecase"
import { syncOwnGroupsUseCase } from "@pinai/domain/usecases/e2ee/sync-own-groups.usecase"
import { getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { shareDeps } from "@/presentation/_libs/key-share-deps"
import { devicesQueryKey } from "@/presentation/hooks/useDevices"
import { useAppStore } from "@/store/store"

// One run at a time page-wide, whichever fanout started it.
const sync = oneAtATime(syncOwnGroupsUseCase)

function warnFanout(what: string, error: unknown): void {
    // eslint-disable-next-line no-console
    console.warn(`[fanout] ${what}`, error)
}

/**
 * Hands the domain's `DeviceFanout` the device list and the conversation ids: it keeps the groups this device holds
 * in step with the account's devices. The WS `device_joined` and `device_approved` pushes only refresh the list
 * (`onDeviceListChanged`).
 */
export function useDeviceFanout(): {
    onDeviceListChanged: () => void
} {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    // The ids alone: the list's rows change on every typing-status flip.
    const conversationIds = useAppStore((s) => s.localDmConvos.map((c) => c.id).join(","))
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

    const fanout = useMemo(
        () =>
            signedIn && idpUrl && actorUri
                ? new DeviceFanout({
                      session: { idpUrl, actorUri, accessToken: () => useAppStore.getState().accessToken },
                      e2ee: getE2eePort(),
                      sync: (url, accessToken, actor, ids) =>
                          sync(url, accessToken, actor, ids, { e2ee: getE2eePort(), deviceDirectory: getDeviceDirectoryPort(), sharing: shareDeps() }),
                      refreshDevices: () => void queryClient.invalidateQueries({ queryKey: devicesQueryKey(idpUrl) }),
                      report: warnFanout,
                  })
                : null,
        [signedIn, idpUrl, actorUri, queryClient],
    )

    useEffect(() => {
        if (!fanout) return
        fanout.start()
        return () => fanout.stop()
    }, [fanout])

    useEffect(() => {
        if (fanout && devices) fanout.devicesListed(devices)
    }, [fanout, devices])

    useEffect(() => {
        fanout?.conversationsChanged(conversationIds ? (conversationIds.split(",") as ConversationId[]) : [])
    }, [fanout, conversationIds])

    const onDeviceListChanged = useCallback(() => {
        if (!idpUrl) return
        // The refreshed list runs the fanout above.
        void queryClient.invalidateQueries({ queryKey: devicesQueryKey(idpUrl) })
    }, [idpUrl, queryClient])

    return { onDeviceListChanged }
}
