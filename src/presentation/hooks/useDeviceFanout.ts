import { useCallback, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import type { ActorUri, ConversationId } from "@/domain/models/e2ee"
import type { DeviceJoinedPayload } from "@/domain/models/ws"
import type { IE2eePort } from "@/domain/ports/e2ee.port"
import { getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { devicesQueryKey } from "@/presentation/hooks/useDevices"
import { useAppStore } from "@/store/store"

export interface FanoutInput {
    idpUrl: string
    accessToken: string
    actorUri: ActorUri
    /** Server-side device ids we'd like to ensure are in every local group. */
    missingDeviceIds: string[]
    /** Conversations the local user is a member of. */
    conversationIds: ConversationId[]
    e2eePort: IE2eePort
}

/**
 * Pure fanout — one Add commit per (missing device, conversation) pair.
 * Per-group failures are swallowed. Exported for unit testing.
 */
export async function runDeviceFanout(input: FanoutInput): Promise<void> {
    for (const _deviceId of input.missingDeviceIds) {
        for (const convoId of input.conversationIds) {
            try {
                await input.e2eePort.addContactToGroup(
                    input.idpUrl,
                    input.accessToken,
                    convoId,
                    input.actorUri,
                )
            } catch (err) {
                // eslint-disable-next-line no-console
                console.warn("[fanout] addContactToGroup failed", convoId, err)
            }
        }
    }
}

/**
 * Hybrid push + reconcile fanout for multi-device. The WS `device_joined`
 * event drives the push path via the returned callback; the reconcile
 * path runs on every device-list refresh and catches the offline case.
 */
export function useDeviceFanout(): {
    onDeviceJoined: (e: DeviceJoinedPayload) => void
} {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const accessToken = useAppStore((s) => s.accessToken)
    const ownAddress = useAppStore((s) => s.user?.address ?? null)
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const ownActorUriRef = useRef<ActorUri | null>(null)
    const queryClient = useQueryClient()

    // Resolve own actor URI once we know idpUrl + ownAddress.
    useEffect(() => {
        if (!idpUrl || !ownAddress) return
        const origin = new URL(idpUrl).origin
        const local = ownAddress.split("@")[0]
        ownActorUriRef.current = `${origin}/users/${local}` as ActorUri
    }, [idpUrl, ownAddress])

    // Reconcile-on-connect: every time the device list refreshes, scan
    // for non-current, non-revoked devices and run the fanout. The
    // refresh already happens via useDevices (TanStack Query) — we just
    // observe its data.
    const conversationIds: ConversationId[] = localDmConvos.map((c) => c.id as ConversationId)
    const { data: devicesResponse } = useQuery({
        queryKey: devicesQueryKey(idpUrl ?? ""),
        queryFn: () => getDeviceDirectoryPort().listDevices(idpUrl!, accessToken!),
        enabled: !!idpUrl && !!accessToken,
    })

    useEffect(() => {
        if (!devicesResponse || !idpUrl || !accessToken || !ownActorUriRef.current) return
        const e2eePort = getE2eePort()
        let cancelled = false
        void (async () => {
            const ownDeviceId = await e2eePort.getDeviceId()
            if (cancelled) return
            const otherActive = devicesResponse.devices.filter(
                (d) => d.device_id !== ownDeviceId && d.revoked_at == null,
            )
            await runDeviceFanout({
                idpUrl,
                accessToken,
                actorUri: ownActorUriRef.current!,
                missingDeviceIds: otherActive.map((d) => d.device_id),
                conversationIds,
                e2eePort,
            })
        })()
        return () => {
            cancelled = true
        }
        // conversationIds is derived from localDmConvos; intentionally not
        // listing it in deps to avoid re-running on every typing-status flip.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [devicesResponse, idpUrl, accessToken])

    const onDeviceJoined = useCallback(
        (e: DeviceJoinedPayload) => {
            if (!idpUrl || !accessToken || !ownActorUriRef.current) return
            // Invalidate the device list so the GET /api/keys/devices query
            // refreshes, surfacing the new device row in Settings → Devices.
            void queryClient.invalidateQueries({
                queryKey: devicesQueryKey(idpUrl),
            })
            void runDeviceFanout({
                idpUrl,
                accessToken,
                actorUri: ownActorUriRef.current,
                missingDeviceIds: [e.deviceId],
                conversationIds: localDmConvos.map((c) => c.id as ConversationId),
                e2eePort: getE2eePort(),
            })
        },
        [idpUrl, accessToken, localDmConvos, queryClient],
    )

    return { onDeviceJoined }
}
