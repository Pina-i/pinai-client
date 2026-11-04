import { toast } from "sonner"

import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import { HistoryRestore, type HistoryRestoreState } from "@pinai/domain/usecases/e2ee/restore-due-history.usecase"
import { getE2eePort } from "@/ioc"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"
import { replayRestoredHistory } from "@/presentation/_libs/replay-restored-history"
import { useAppStore } from "@/store/store"

const RESTORE_TOAST = "history-restore"

// One for the page load: the restore outlives the screen that started it, the asking page's included.
let restore: { over: IE2eePort; running: HistoryRestore } | null = null
let appMounted = 0
let toastUp = false

/** zustand marks the cache hydrated only once a read succeeded and was applied: a failed read never resolves this. */
function cacheReady(): Promise<void> {
    const { persist } = useAppStore
    if (persist.hasHydrated()) return Promise.resolve()
    return new Promise((resolve) => {
        const stop = persist.onFinishHydration(() => {
            stop()
            resolve()
        })
    })
}

// Shown only in the app, where the asking page's own line isn't; once up, settled whatever unmounts.
function showInCorner(state: HistoryRestoreState): void {
    if (state.kind === "restoring") {
        if (appMounted === 0) return
        toast.loading("Bringing your history back…", { id: RESTORE_TOAST })
        toastUp = true
        return
    }
    if (!toastUp || state.kind === "idle") return
    toastUp = false
    if (state.kind === "restored") {
        const description = state.messages === 0 ? undefined : `${state.messages} message${state.messages === 1 ? "" : "s"}`
        toast.success("Your history is back", { id: RESTORE_TOAST, description })
    } else {
        toast.error("Your history couldn't be brought back", {
            id: RESTORE_TOAST,
            description: "It's tried again the next time Pīna'i starts.",
        })
    }
}

export function historyRestore(): HistoryRestore {
    const port = getE2eePort()
    if (restore?.over !== port) {
        const running = new HistoryRestore({ e2ee: port, cacheReady })
        running.onChange(() => showInCorner(running.state))
        restore = { over: port, running }
        toastUp = false
    }
    return restore.running
}

/** While the app is mounted, a restore under way shows in its corner. Answers the cleanup. */
export function showRestoreInApp(): () => void {
    appMounted += 1
    const running = historyRestore()
    if (running.state.kind === "restoring" && !toastUp) showInCorner(running.state)
    return () => {
        appMounted -= 1
    }
}

/** The restore due, if any, run in the background and replayed into the store; never thrown. */
export function restoreDueHistory(): Promise<HistoryRestoreState> {
    const { idpUrl } = useAppStore.getState()
    const running = historyRestore()
    if (!idpUrl) return Promise.resolve(running.state)
    return running.run({ idpUrl, accessToken: () => useAppStore.getState().accessToken }, replayRestoredHistory).catch((e: unknown) => {
        warnE2ee("restoring the history archive", e)
        return running.state
    })
}
