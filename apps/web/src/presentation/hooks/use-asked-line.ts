import { useCallback, useSyncExternalStore } from "react"

import { instanceHost } from "@pinai/domain/models/instance"
import { askedLine } from "@pinai/domain/models/relative-time"
import { useAppStore } from "@/store/store"

const TICK_MS = 30_000

let now = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void): () => void {
    now = Date.now()
    listeners.add(listener)
    timer ??= setInterval(() => {
        now = Date.now()
        for (const notify of listeners) notify()
    }, TICK_MS)
    return () => {
        listeners.delete(listener)
        if (listeners.size > 0 || timer === null) return
        clearInterval(timer)
        timer = null
    }
}

const nothingToWatch = () => () => undefined

/** "asked 2 minutes ago · kauai.studio" ("signed in …" for a device), read again every 30 s while a request shows. */
export function useAskedLine(createdAt: string | number | null, verb = "asked"): string {
    const idpUrl = useAppStore((s) => s.idpUrl)
    // A new subscription for each request reads the clock again: never a time from before it showed.
    const watch = useCallback((listener: () => void) => (createdAt === null ? nothingToWatch() : subscribe(listener)), [createdAt])
    const at = useSyncExternalStore(watch, () => now)
    const host = instanceHost(idpUrl)
    return createdAt === null ? `${verb} just now${host ? ` · ${host}` : ""}` : askedLine(createdAt, at, host, verb)
}
