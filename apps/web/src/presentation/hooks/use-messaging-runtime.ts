import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

import { MessagingRuntime } from "@pinai/domain/usecases/dm/messaging-runtime.usecase"
import { getE2eePort } from "@/ioc"
import { conversationJoins } from "@/presentation/_libs/conversation-joins"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { registerMessagingRuntimeHandler } from "@/presentation/hooks/useIdpWebSocket"
import { dmConversationsQueryKey } from "@/presentation/hooks/useLoadDmConversations"
import { useAppStore } from "@/store/store"

/**
 * The domain's `MessagingRuntime` while the app runs, fed the socket's pushes and its comebacks and the conversation
 * list. Mounted for a device that is in only.
 */
export function useMessagingRuntime(): void {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const socketUp = useAppStore((s) => s.wsStatus === "connected")
    const queryClient = useQueryClient()
    const running = useRef<MessagingRuntime | null>(null)
    const connects = useRef(0)

    useEffect(() => {
        if (!signedIn || !idpUrl || !actorUri) return
        const runtime = new MessagingRuntime({
            session: { idpUrl, actorUri, accessToken: () => useAppStore.getState().accessToken },
            e2ee: getE2eePort(),
            joins: conversationJoins(),
            conversationsStale: () => void queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) }),
            report: warnE2ee,
        })
        runtime.conversationsChanged(useAppStore.getState().localDmConvos)
        const unsubscribe = useAppStore.subscribe((state, previous) => {
            if (state.localDmConvos !== previous.localDmConvos) runtime.conversationsChanged(state.localDmConvos)
        })
        const unregister = registerMessagingRuntimeHandler((event) => runtime.socketEvent(event))
        runtime.start()
        running.current = runtime
        return () => {
            running.current = null
            unregister()
            unsubscribe()
            runtime.stop()
        }
    }, [signedIn, idpUrl, actorUri, queryClient])

    // The first connect follows the start; a later one may find the instance back.
    useEffect(() => {
        if (!socketUp) return
        if (connects.current++ === 0) return
        running.current?.reconnected()
    }, [socketUp])
}
