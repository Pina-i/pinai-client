import type { PendingKeyLock } from "@pinai/domain/usecases/e2ee/settle-pending-history-key.usecase"

function accountLock(name: string, actorUri: string): PendingKeyLock | undefined {
    if (typeof navigator === "undefined" || !navigator.locks) return undefined
    // The lock's own typing nests the callback's promise; it resolves to what `run` does.
    return <T>(run: () => Promise<T>) => navigator.locks.request(`${name}:${actorUri}`, run) as unknown as Promise<T>
}

/** One tab at a time writes, sends or settles the account's pending key; none where the platform can't tell. */
export function pendingKeyLock(actorUri: string): PendingKeyLock | undefined {
    return accountLock("pinai-pending-key", actorUri)
}

/** One tab at a time re-archives the account's history, so its cursor never goes back. */
export function rearchiveLock(actorUri: string): PendingKeyLock | undefined {
    return accountLock("pinai-rearchive", actorUri)
}
