import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import {
    HistoryRearchive,
    type HistoryRearchiveState,
    type LocalHistory,
} from "@pinai/domain/usecases/e2ee/rearchive-history.usecase"
import { getE2eePort } from "@/ioc"
import { cacheReady } from "@/presentation/_libs/cache-ready"
import { CornerToast } from "@/presentation/_libs/corner-toast"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"
import { rearchiveLock } from "@/presentation/_libs/pending-key-lock"
import { useAppStore } from "@/store/store"

// One for the page load: the re-archive outlives the Settings pane that started it.
let rearchive: { over: IE2eePort; running: HistoryRearchive } | null = null
const corner = new CornerToast("history-rearchive")

/** The cache as read back — never before: the empty defaults would re-archive nothing, and call it done. */
async function localHistory(): Promise<LocalHistory | null> {
    await cacheReady()
    const { dmMessages, user } = useAppStore.getState()
    if (user?.address) return { me: user.address, conversations: dmMessages }
    warnE2ee("archiving the history again", "no account address to read the cache by")
    return null
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function lock<T>(run: () => Promise<T>): Promise<T> {
    const actorUri = useAppStore.getState().user?.actor_uri
    const held = actorUri ? rearchiveLock(actorUri) : undefined
    return held ? held(run) : run()
}

function showInCorner(state: HistoryRearchiveState): void {
    switch (state.kind) {
        case "rearchiving":
            corner.progress(`Re-saving your history… ${state.done} of ${state.total} messages`)
            return
        case "rearchived":
            corner.success(
                "Your history is saved under your new words",
                state.skipped === 0 ? undefined : `${state.skipped} message${state.skipped === 1 ? "" : "s"} couldn't be saved again.`,
            )
            return
        case "failed":
            warnE2ee("archiving the history again", state.error)
            corner.failure("Your history couldn't be saved again", "It's tried again the next time Pīna'i starts.")
            return
        case "abandoned":
        case "signed-out":
            corner.dismiss()
            return
    }
}

export function historyRearchive(): HistoryRearchive {
    const port = getE2eePort()
    if (rearchive?.over !== port) {
        const running = new HistoryRearchive({ e2ee: port, localHistory, sleep, lock })
        running.onChange(() => showInCorner(running.state))
        rearchive = { over: port, running }
        corner.forget()
    }
    return rearchive.running
}

/** While the app is mounted, a re-archive under way shows in its corner. Answers the cleanup. */
export function showRearchiveInApp(): () => void {
    const leave = corner.mount()
    const running = historyRearchive()
    if (running.state.kind === "rearchiving" && !corner.isUp) showInCorner(running.state)
    return leave
}

/** The re-archive due, if any, run in the background; never thrown. */
export function rearchiveDueHistory(): Promise<HistoryRearchiveState> {
    const { idpUrl } = useAppStore.getState()
    const running = historyRearchive()
    if (!idpUrl) return Promise.resolve(running.state)
    return running.run({ idpUrl, accessToken: () => useAppStore.getState().accessToken }).catch((e: unknown) => {
        warnE2ee("archiving the history again", e)
        return running.state
    })
}
