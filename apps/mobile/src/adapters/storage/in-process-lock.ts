import type { PendingKeyLock } from "@pinai/domain/usecases/e2ee/settle-pending-history-key.usecase"

/** One run at a time within the app's one process: the phone has no tabs to keep apart, only its own flows. */
export function inProcessLock(): PendingKeyLock {
    let tail: Promise<unknown> = Promise.resolve()
    return <T>(run: () => Promise<T>): Promise<T> => {
        const next = tail.then(run, run)
        tail = next.catch(() => undefined)
        return next
    }
}
