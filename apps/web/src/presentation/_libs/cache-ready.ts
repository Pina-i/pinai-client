import { useAppStore } from "@/store/store"

/** zustand marks the cache hydrated only once a read succeeded and was applied: a failed read never resolves this. */
export function cacheReady(): Promise<void> {
    const { persist } = useAppStore
    if (persist.hasHydrated()) return Promise.resolve()
    return new Promise((resolve) => {
        const stop = persist.onFinishHydration(() => {
            stop()
            resolve()
        })
    })
}
