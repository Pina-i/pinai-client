import { useEffect, useRef } from "react"

import { rearchiveDueHistory, showRearchiveInApp } from "@/presentation/_libs/history-rearchive"
import { useAppStore } from "@/store/store"

/** A re-archive cut short — a reload, an instance out of reach — goes on where it stopped. */
export function useHistoryRearchive(): void {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const socketUp = useAppStore((s) => s.wsStatus === "connected")
    const connects = useRef(0)

    useEffect(() => showRearchiveInApp(), [])

    useEffect(() => {
        if (signedIn) void rearchiveDueHistory()
    }, [signedIn])

    // The first connect follows the run at startup; a later one may find the instance back.
    useEffect(() => {
        if (!socketUp) return
        if (connects.current++ === 0) return
        void rearchiveDueHistory()
    }, [socketUp])
}
