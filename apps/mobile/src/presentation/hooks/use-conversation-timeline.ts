import type { CachedTimelineMessage, ConversationTimeline } from "@pinai/domain/ports/conversation-cache.port"
import { useCallback, useEffect, useSyncExternalStore } from "react"
import { getConversationCache } from "@/ioc"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"

/** A conversation as this phone holds it, its sealed row read once if it wasn't: `undefined` until it is. */
export function useConversationTimeline(conversationId: string): ConversationTimeline<CachedTimelineMessage> | undefined {
    const cache = getConversationCache()
    const subscribe = useCallback((onChange: () => void) => cache.subscribe(conversationId, onChange), [cache, conversationId])
    const timeline = useSyncExternalStore(subscribe, () => cache.snapshot(conversationId))

    useEffect(() => {
        if (cache.snapshot(conversationId) !== undefined) return
        cache.read(conversationId).catch((error: unknown) => warnE2ee(`reading the conversation ${conversationId}`, error))
    }, [cache, conversationId])

    return timeline
}
