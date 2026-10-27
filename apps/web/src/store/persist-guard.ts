import type { PersistStorage, StorageValue } from "zustand/middleware"

export interface GuardedPersistStorage<T> extends PersistStorage<T> {
    /** For `persist`'s `onRehydrateStorage`: what was read is now in the store, or reading failed. */
    hydrated: (state: unknown, error?: unknown) => void
}

/**
 * The persisted cache's storage, writing only over what is in the store. zustand's `persist` saves on
 * every `set`, hydrated or not: a `set` before what was read is applied would save the empty
 * defaults over the cache, and the message cache is the only decrypted copy of the history.
 *
 * - Writes are dropped until hydration has applied a successful read; nothing stored counts as a
 *   success. Hydration puts the stored fields back over whatever was set before it.
 * - After a failed read, writes stay dropped for that page load: a cache that can't be read now may
 *   be later.
 * - A write whose every field is the very object last read or written is skipped, so a `set`
 *   outside the cache doesn't seal it all again. It relies on the slices replacing a persisted
 *   field to change it, never mutating it in place.
 * - Writes go out one at a time, the latest waiting value replacing any older one not yet sent, so
 *   the last value written is the last value set.
 *
 * One guard per database: a page binds one account's, and another binding is another guard, shut
 * until its own hydration (on the web, switching accounts reloads the page).
 */
export function guardPersistStorage<T extends object>(storage: PersistStorage<T>): GuardedPersistStorage<T> {
    let gate: "shut" | "open" | "unreadable" = "shut"
    // The newest value read, written, or waiting to be.
    let latest: T | null = null
    let waiting: StorageValue<T> | null = null
    let scheduled: Promise<void> | null = null
    let previous: Promise<void> = Promise.resolve()

    async function flush(name: string): Promise<void> {
        const value = waiting!
        waiting = null
        scheduled = null
        try {
            await storage.setItem(name, value)
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn(`Persisted slice "${name}" failed to save; the next change saves it again`, e)
            // Not saved: unless a newer value waits, the next write must not be skipped as the same.
            if (waiting === null) latest = null
            throw e
        }
    }

    return {
        async getItem(name: string): Promise<StorageValue<T> | null> {
            try {
                const value = await storage.getItem(name)
                latest = value?.state ?? null
                return value
            } catch (e) {
                gate = "unreadable"
                throw e
            }
        },

        setItem(name: string, value: StorageValue<T>): Promise<void> {
            if (gate !== "open" || unchanged(latest, value.state)) return Promise.resolve()
            latest = value.state
            waiting = value
            if (scheduled) return scheduled
            scheduled = previous.then(() => flush(name))
            previous = scheduled.catch(() => undefined)
            return scheduled
        },

        removeItem: (name) => storage.removeItem(name),

        hydrated(_state, error) {
            if (error !== undefined) gate = "unreadable"
            else if (gate === "shut") gate = "open"
        },
    }
}

function unchanged<T extends object>(last: T | null, next: T): boolean {
    if (last === null) return false
    const fields = Object.keys(next) as (keyof T)[]
    return fields.length === Object.keys(last).length && fields.every((field) => next[field] === last[field])
}
