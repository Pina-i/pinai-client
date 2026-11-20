import { describe, expect, it } from "vitest"
import { LastInstanceKvAdapter, RecentInstancesKvAdapter, type SyncKeyValue } from "../src/adapters/storage/kv-storage"

function kv(): SyncKeyValue {
    const items = new Map<string, string>()
    return {
        getItemSync: (key) => items.get(key) ?? null,
        setItemSync: (key, value) => void items.set(key, value),
        removeItemSync: (key) => items.delete(key),
    }
}

describe("the phone's small storage", () => {
    it("keeps the recent instances as written, and nothing it can't read", () => {
        const store = kv()
        new RecentInstancesKvAdapter(store).write(["https://aotearoa.nz"])

        expect(new RecentInstancesKvAdapter(store).read()).toEqual(["https://aotearoa.nz"])
        store.setItemSync("pinai.recent-instances", "{not json")
        expect(new RecentInstancesKvAdapter(store).read()).toBeNull()
    })

    it("keeps the last instance chosen", () => {
        const store = kv()
        new LastInstanceKvAdapter(store).write("https://reef.chat")

        expect(new LastInstanceKvAdapter(store).read()).toBe("https://reef.chat")
    })
})
