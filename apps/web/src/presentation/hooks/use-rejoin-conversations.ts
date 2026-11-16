import { useEffect, useRef } from "react"

import { joinMissingConversations } from "@/presentation/_libs/conversation-joins"
import { useAppStore } from "@/store/store"

/**
 * Brings this device into the conversations of its list it holds no group for — by a sibling's
 * Welcome or by itself (`ConversationJoins`) —, at start, when the list changes and when the socket
 * comes back. Mounted for a device that is in only.
 */
export function useRejoinConversations(): void {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const socketUp = useAppStore((s) => s.wsStatus === "connected")
    // The ids and removals alone: a row's other fields change with every message.
    const listKey = useAppStore((s) => s.localDmConvos.map((c) => `${c.id}:${c.removedAt ?? ""}`).join(","))
    const connects = useRef(0)

    useEffect(() => {
        if (signedIn && idpUrl) joinMissingConversations()
    }, [signedIn, idpUrl, listKey])

    // The first connect follows the run at start; a later one may find the instance back.
    useEffect(() => {
        if (!socketUp) return
        if (connects.current++ === 0) return
        joinMissingConversations()
    }, [socketUp])
}
