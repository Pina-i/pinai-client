import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import { HistoryRestore, type HistoryRestoreState } from "@pinai/domain/usecases/e2ee/restore-due-history.usecase"
import { getE2eePort } from "@/ioc"
import { cacheReady } from "@/presentation/_libs/cache-ready"
import { CornerToast } from "@/presentation/_libs/corner-toast"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"
import { replayRestoredHistory } from "@/presentation/_libs/replay-restored-history"
import { useAppStore } from "@/store/store"

// One for the page load: the restore outlives the screen that started it, the asking page's included.
let restore: { over: IE2eePort; running: HistoryRestore } | null = null
const corner = new CornerToast("history-restore")

// Shown only in the app, where the asking page's own line isn't.
function showInCorner(state: HistoryRestoreState): void {
    if (state.kind === "restoring") corner.progress("Bringing your history back…")
    else if (state.kind === "restored") {
        corner.success("Your history is back", state.messages === 0 ? undefined : `${state.messages} message${state.messages === 1 ? "" : "s"}`)
    } else if (state.kind === "failed") {
        corner.failure("Your history couldn't be brought back", "It's tried again the next time Pīna'i starts.")
    }
}

export function historyRestore(): HistoryRestore {
    const port = getE2eePort()
    if (restore?.over !== port) {
        const running = new HistoryRestore({ e2ee: port, cacheReady })
        running.onChange(() => showInCorner(running.state))
        restore = { over: port, running }
        corner.forget()
    }
    return restore.running
}

/** While the app is mounted, a restore under way shows in its corner. Answers the cleanup. */
export function showRestoreInApp(): () => void {
    const leave = corner.mount()
    const running = historyRestore()
    if (running.state.kind === "restoring" && !corner.isUp) showInCorner(running.state)
    return leave
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
