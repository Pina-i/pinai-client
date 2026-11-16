import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import type { DmConversationSummary } from "@pinai/domain/models/dm"
import { memberName, newDeviceLine, type NewDeviceSeen } from "@pinai/domain/models/new-device"
import { getDmConversationsUseCase } from "@pinai/domain/usecases/dm/get-dm-conversations.usecase"
import { getDmPort, getE2eePort } from "@/ioc"
import { cacheReady } from "@/presentation/_libs/cache-ready"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useAppStore } from "@/store/store"
import { dmConversationsQueryKey } from "./useLoadDmConversations"

/**
 * The line a conversation shows when someone else's device joined it by itself, unproven
 * (`IE2eePort.onNewDevice`): kept in the cache once it is read back — hydration would put the
 * stored lines over one set before —, the person named as the conversation list names them.
 * Mounted for a device that is in only.
 */
export function useNewDeviceLines(): void {
    const queryClient = useQueryClient()
    useEffect(
        () =>
            getE2eePort().onNewDevice((seen) => {
                keepLine(queryClient, seen).catch((e: unknown) => warnE2ee(`keeping the new device line of ${seen.conversationId}`, e))
            }),
        [queryClient],
    )
}

async function keepLine(queryClient: QueryClient, seen: NewDeviceSeen): Promise<void> {
    await cacheReady()
    const name = memberName(await conversations(queryClient), seen.conversationId, seen.actorUri)
    useAppStore.getState().addNewDeviceLine(seen.conversationId, newDeviceLine(seen, name))
}

// The list the sidebar holds; read once when it isn't yet, the handle standing in when it can't be.
async function conversations(queryClient: QueryClient): Promise<DmConversationSummary[]> {
    const { idpUrl, accessToken } = useAppStore.getState()
    const queryKey = dmConversationsQueryKey(idpUrl ?? "")
    const held = queryClient.getQueryData<DmConversationSummary[]>(queryKey)
    if (held || !idpUrl || !accessToken) return held ?? []
    return queryClient
        .fetchQuery({ queryKey, queryFn: () => getDmConversationsUseCase(idpUrl, accessToken, getDmPort()) })
        .catch(() => [])
}
