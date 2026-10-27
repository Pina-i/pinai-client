/**
 * The persisted message cache is the only decrypted copy of the history, and zustand's `persist`
 * saves on every `set`, hydrated or not. The guard writes only over what hydration applied: never
 * before, never after a failed read, not at all when nothing in the cache changed, and one write
 * at a time, the newest last.
 */
import { describe, expect, it, vi } from "vitest"
import { create } from "zustand"
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware"

import { type GuardedPersistStorage, guardPersistStorage } from "@/store/persist-guard"

interface Cache {
    dmMessages: Record<string, string[]>
    dmUnread: Record<string, number>
}

const NAME = "pinai-app-state"
const STORED: StorageValue<Cache> = { state: { dmMessages: { c1: ["kia ora"] }, dmUnread: { c1: 2 } }, version: 1 }

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => (resolve = r))
    return { promise, resolve }
}

/** One account's database, in memory; `read` decides how a read goes, `write` how long a write takes. */
function database(
    read: () => Promise<StorageValue<Cache> | null> = async () => structuredClone(STORED),
    write: (value: StorageValue<Cache>) => Promise<void> = async () => undefined,
) {
    const writes: StorageValue<Cache>[] = []
    const storage: PersistStorage<Cache> = {
        getItem: read,
        setItem: async (_name, value) => {
            await write(value)
            writes.push(value)
        },
        removeItem: async () => undefined,
    }
    return { storage, writes }
}

/** What `persist` does: read, apply, then say so. */
async function hydrate(guard: GuardedPersistStorage<Cache>) {
    const value = await guard.getItem(NAME)
    guard.hydrated(value?.state)
    return value
}

const cache = (messages: string[]): StorageValue<Cache> => ({ state: { dmMessages: { c1: messages }, dmUnread: {} }, version: 1 })

describe("guardPersistStorage", () => {
    it("drops a write made before the cache was read", async () => {
        const db = database()
        const guard = guardPersistStorage(db.storage)

        await guard.setItem(NAME, cache([]))

        expect(db.writes).toEqual([])
    })

    it("drops a write made once read but not yet applied", async () => {
        const db = database()
        const guard = guardPersistStorage(db.storage)

        await guard.getItem(NAME)
        await guard.setItem(NAME, cache([]))

        expect(db.writes).toEqual([])
    })

    it("writes once hydration applied the read, whether it held something or nothing", async () => {
        for (const stored of [STORED, null]) {
            const db = database(async () => structuredClone(stored))
            const guard = guardPersistStorage(db.storage)

            await hydrate(guard)
            await guard.setItem(NAME, cache(["kia ora", "tēnā koe"]))

            expect(db.writes).toEqual([cache(["kia ora", "tēnā koe"])])
        }
    })

    it("never writes after a failed read, even once a later read succeeds", async () => {
        const read = vi.fn<() => Promise<StorageValue<Cache> | null>>().mockRejectedValueOnce(new Error("blocked"))
        read.mockResolvedValue(structuredClone(STORED))
        const db = database(read)
        const guard = guardPersistStorage(db.storage)

        await expect(guard.getItem(NAME)).rejects.toThrow("blocked")
        guard.hydrated(undefined, new Error("blocked"))
        await guard.setItem(NAME, cache([]))
        await hydrate(guard)
        await guard.setItem(NAME, cache(["kia ora", "tēnā koe"]))

        expect(db.writes).toEqual([])
    })

    it("skips a write whose every field is the one last read or written", async () => {
        const db = database()
        const guard = guardPersistStorage(db.storage)

        const read = await hydrate(guard)
        await guard.setItem(NAME, { state: { ...read!.state }, version: 1 })
        const changed = cache(["kia ora", "tēnā koe"])
        await guard.setItem(NAME, changed)
        await guard.setItem(NAME, { state: { ...changed.state }, version: 1 })

        expect(db.writes).toEqual([changed])
    })

    it("writes again what a failed write didn't save", async () => {
        const db = database()
        const failing = vi.fn().mockRejectedValueOnce(new Error("quota")).mockImplementation(db.storage.setItem)
        const guard = guardPersistStorage({ ...db.storage, setItem: failing })
        const changed = cache(["kia ora", "tēnā koe"])
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

        await hydrate(guard)
        await expect(guard.setItem(NAME, changed)).rejects.toThrow("quota")
        await guard.setItem(NAME, changed)

        expect(db.writes).toEqual([changed])
        expect(warn).toHaveBeenCalledOnce()
        warn.mockRestore()
    })

    it("writes one at a time, the newest waiting value in place of older ones, so the last set lands last", async () => {
        const slow = deferred<void>()
        let inFlight = 0
        let most = 0
        const db = database(undefined, async (value) => {
            inFlight++
            most = Math.max(most, inFlight)
            if (value.state.dmMessages.c1.length === 1) await slow.promise
            inFlight--
        })
        const guard = guardPersistStorage(db.storage)
        await hydrate(guard)

        const first = guard.setItem(NAME, cache(["one"]))
        await vi.waitFor(() => expect(inFlight).toBe(1))
        const second = guard.setItem(NAME, cache(["one", "two"]))
        const third = guard.setItem(NAME, cache(["one", "two", "three"]))
        slow.resolve()
        await Promise.all([first, second, third])

        expect(most).toBe(1)
        expect(db.writes).toEqual([cache(["one"]), cache(["one", "two", "three"])])
    })

    it("makes one write of a burst of saves", async () => {
        const db = database()
        const guard = guardPersistStorage(db.storage)
        await hydrate(guard)

        await Promise.all([
            guard.setItem(NAME, cache(["one"])),
            guard.setItem(NAME, cache(["one", "two"])),
            guard.setItem(NAME, cache(["one", "two", "three"])),
        ])

        expect(db.writes).toEqual([cache(["one", "two", "three"])])
    })

    it("shuts again for another binding, until that database is hydrated", async () => {
        const alice = database()
        const bob = database()
        await hydrate(guardPersistStorage(alice.storage))

        const bobGuard = guardPersistStorage(bob.storage)
        await bobGuard.setItem(NAME, cache([]))
        expect(bob.writes).toEqual([])

        await hydrate(bobGuard)
        await bobGuard.setItem(NAME, cache(["salut"]))
        expect(bob.writes).toEqual([cache(["salut"])])
    })
})

describe("the guard under zustand's persist", () => {
    function store(read: () => Promise<StorageValue<Cache> | null>, writes: StorageValue<Cache>[]) {
        const guard = guardPersistStorage<Cache>({
            getItem: read,
            setItem: async (_name, value) => void writes.push(value),
            removeItem: async () => undefined,
        })
        return create<Cache & { signedIn: boolean; signIn: () => void }>()(
            persist(
                (set) => ({ dmMessages: {}, dmUnread: {}, signedIn: false, signIn: () => set({ signedIn: true }) }),
                {
                    name: NAME,
                    version: 1,
                    storage: guard,
                    onRehydrateStorage: () => (state, error) => guard.hydrated(state, error),
                    partialize: (s): Cache => ({ dmMessages: s.dmMessages, dmUnread: s.dmUnread }),
                },
            ),
        )
    }

    it("keeps the stored cache through a `set` made while it is still being read", async () => {
        const reading = deferred<StorageValue<Cache> | null>()
        const writes: StorageValue<Cache>[] = []
        const useStore = store(() => reading.promise, writes)

        // A callback's `setSession` racing the read: unguarded, this saved `{}` over the history.
        useStore.getState().signIn()
        reading.resolve(structuredClone(STORED))
        await vi.waitFor(() => expect(useStore.persist.hasHydrated()).toBe(true))
        useStore.getState().signIn()

        expect(writes).toEqual([])
        expect(useStore.getState()).toMatchObject({ ...STORED.state, signedIn: true })
    })

    it("keeps it through a `set` made between the read's answer and its being applied", async () => {
        const reading = deferred<StorageValue<Cache> | null>()
        const writes: StorageValue<Cache>[] = []
        const useStore = store(() => reading.promise, writes)

        // Runs after the guard has the read, before `persist` puts it in the store.
        void reading.promise.then(() => useStore.getState().signIn())
        reading.resolve(structuredClone(STORED))
        await vi.waitFor(() => expect(useStore.persist.hasHydrated()).toBe(true))

        expect(writes).toEqual([])
        expect(useStore.getState()).toMatchObject({ ...STORED.state, signedIn: true })
    })
})
