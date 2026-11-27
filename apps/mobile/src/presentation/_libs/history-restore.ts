import type { RestoredMessage } from "@pinai/domain/models/history-archive"
import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import { applyRestoredHistoryUseCase } from "@pinai/domain/usecases/e2ee/apply-restored-history.usecase"
import { HistoryRestore, type HistoryRestoreState } from "@pinai/domain/usecases/e2ee/restore-due-history.usecase"
import { getConversationCache, getE2eePort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { warnE2ee } from "./warn-e2ee"

// One per account's core: the restore outlives the screen that started it, the onboarding's included.
let restore: { over: IE2eePort; running: HistoryRestore } | null = null

function historyRestore(): HistoryRestore {
    const port = getE2eePort()
    if (restore?.over !== port) {
        const running = new HistoryRestore({ e2ee: port, cacheReady: () => getConversationCache().ready() })
        running.onChange(() => {
            if (running.state.kind === "failed") warnE2ee("restoring the history archive; tried again at the next start", running.state.error)
        })
        restore = { over: port, running }
    }
    return restore.running
}

// Applied only once every conversation it changed is written: the restore then marks itself applied.
async function intoTheCache(messages: RestoredMessage[]): Promise<void> {
    const cache = getConversationCache()
    await cache.saved(await applyRestoredHistoryUseCase(messages, { cache, myAddress: useAppStore.getState().user?.address }))
}

/** The archive's restore due, if any, into the conversation cache, once its rows can be read; never thrown. */
export function restoreDueHistory(): Promise<HistoryRestoreState> {
    const { idpUrl } = useAppStore.getState()
    const running = historyRestore()
    if (!idpUrl) return Promise.resolve(running.state)
    return running.run({ idpUrl, accessToken: () => useAppStore.getState().accessToken }, intoTheCache).catch((error: unknown) => {
        warnE2ee("restoring the history archive", error)
        return running.state
    })
}
