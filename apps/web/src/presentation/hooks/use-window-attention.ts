import { useSyncExternalStore } from "react"

import { isWindowAttended, subscribeWindowAttention } from "@/presentation/_libs/window-attention"
import { useAppStore } from "@/store/store"
import { isBeingRead } from "@pinai/domain/models/attention"

export function useWindowAttended(): boolean {
    return useSyncExternalStore(subscribeWindowAttention, isWindowAttended)
}

function subscribeBeingRead(onChange: () => void): () => void {
    const stopWindow = subscribeWindowAttention(onChange)
    const stopStore = useAppStore.subscribe(onChange)
    return () => {
        stopWindow()
        stopStore()
    }
}

/** One boolean over the window and the open conversation: a focus flip re-renders only the row being read. */
export function useBeingRead(conversationId: string | null): boolean {
    return useSyncExternalStore(
        subscribeBeingRead,
        () => conversationId !== null && isBeingRead(useAppStore.getState().activeDm === conversationId, isWindowAttended()),
    )
}
