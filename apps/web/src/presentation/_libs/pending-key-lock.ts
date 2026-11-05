import type { PendingKeyLock } from "@pinai/domain/usecases/e2ee/settle-pending-history-key.usecase"

/** One tab at a time writes, sends or settles the account's pending key; none where the platform can't tell. */
export function pendingKeyLock(actorUri: string): PendingKeyLock | undefined {
    if (typeof navigator === "undefined" || !navigator.locks) return undefined
    // The lock's own typing nests the callback's promise; it resolves to what `run` does.
    return <T>(run: () => Promise<T>) => navigator.locks.request(`pinai-pending-key:${actorUri}`, run) as unknown as Promise<T>
}
