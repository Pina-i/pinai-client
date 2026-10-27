/**
 * Reading the persisted message cache back. A key that can't be loaded, like IndexedDB failing, is
 * a failed read: thrown, the row left alone, the guard keeping writes shut until the next page
 * load. A row that can't be decoded with the key loaded is kept aside under another name, never
 * deleted, and the app starts empty.
 */
import { describe, expect, it, vi } from "vitest"
import "fake-indexeddb/auto"

import { WebCryptoDeviceKeyAdapter } from "@/adapters/e2ee/device-key.adapter"
import { createEncryptedIdbStorage, openSlicesDatabase } from "@/adapters/storage/encrypted-idb-storage.adapter"
import { IdbKeyValueStore } from "@/adapters/storage/idb-key-value-store.adapter"
import type { IDeviceKeyPort } from "@pinai/domain/ports/device-key.port"

const NAME = "pinai-app-state"
const VALUE = { state: { dmMessages: { c1: ["kia ora"] } }, version: 1 }

let databases = 0

/** A device key that seals by copying, so the specs control how opening goes. */
function deviceKey(): IDeviceKeyPort & { ready: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> } {
    return {
        ready: vi.fn(async () => undefined),
        seal: async (plaintext) => ({ ciphertext: plaintext.slice(), nonce: new Uint8Array(12) }),
        open: vi.fn(async (sealed) => sealed.ciphertext),
        wipe: async () => undefined,
    }
}

async function cache<K extends IDeviceKeyPort>(key: K) {
    const name = `pinai-zustand-store:spec-${++databases}`
    const storage = createEncryptedIdbStorage<typeof VALUE.state>(key, name)
    await storage.setItem(NAME, VALUE)
    const rows = async () => {
        const db = await openSlicesDatabase(name)
        const keys = (await db.getAllKeys("slices")).map(String).sort()
        db.close()
        return keys
    }
    return { name, storage, key, rows }
}

async function row(database: string, key: string): Promise<unknown> {
    const db = await openSlicesDatabase(database)
    const value: unknown = await db.get("slices", key)
    db.close()
    return value
}

describe("the persisted cache's storage", () => {
    it("reads back what it wrote", async () => {
        const { storage } = await cache(deviceKey())

        expect(await storage.getItem(NAME)).toEqual(VALUE)
    })

    it("throws when the device key can't be loaded, and leaves the row where it is", async () => {
        const { storage, key, rows } = await cache(deviceKey())
        key.ready.mockRejectedValueOnce(new Error("IndexedDB unavailable"))

        await expect(storage.getItem(NAME)).rejects.toThrow("IndexedDB unavailable")

        expect(await rows()).toEqual([NAME])
        expect(key.open).not.toHaveBeenCalled()
    })

    it("keeps a row it can't decode aside, under another name, and starts empty", async () => {
        const { storage, key, rows } = await cache(deviceKey())
        key.open.mockRejectedValueOnce(new DOMException("The operation failed", "OperationError"))
        vi.spyOn(console, "warn").mockImplementation(() => undefined)

        expect(await storage.getItem(NAME)).toBeNull()

        const kept = await rows()
        expect(kept).toHaveLength(1)
        expect(kept[0]).toMatch(new RegExp(`^${NAME}:unreadable:\\d{4}-\\d{2}-\\d{2}T`))
    })

    it("never overwrites a row kept aside earlier", async () => {
        const { storage, key, rows } = await cache(deviceKey())
        vi.spyOn(console, "warn").mockImplementation(() => undefined)
        key.open.mockRejectedValue(new Error("not msgpack"))

        await storage.getItem(NAME)
        await new Promise((resolve) => setTimeout(resolve, 2))
        await storage.setItem(NAME, VALUE)
        await storage.getItem(NAME)

        const kept = await rows()
        expect(kept).toHaveLength(2)
        expect(kept.every((row) => row.startsWith(`${NAME}:unreadable:`))).toBe(true)
    })

    it("throws, the row left where it is, when it can't keep a row aside", async () => {
        const { name, storage, key, rows } = await cache(deviceKey())
        vi.spyOn(console, "warn").mockImplementation(() => undefined)
        key.open.mockRejectedValue(new Error("not msgpack"))
        const original = await row(name, NAME)
        vi.useFakeTimers({ toFake: ["Date"] })
        vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z"))
        const aside = `${NAME}:unreadable:2026-10-27T12:00:00.000Z`
        const db = await openSlicesDatabase(name)
        await db.add("slices", "kept earlier", aside)
        db.close()

        try {
            await expect(storage.getItem(NAME)).rejects.toThrow()
        } finally {
            vi.useRealTimers()
        }

        expect(await rows()).toEqual([NAME, aside].sort())
        expect(await row(name, NAME)).toEqual(original)
        expect(await row(name, aside)).toBe("kept earlier")
    })

    it("opens with the device key it loaded, whatever a later read of the key's slot does", async () => {
        const keys = new IdbKeyValueStore(`pinai-e2ee:spec-key-${++databases}`)
        const { name } = await cache(new WebCryptoDeviceKeyAdapter(keys))
        const read = keys.getCryptoKey.bind(keys)
        const slot = vi.spyOn(keys, "getCryptoKey")
        slot.mockImplementationOnce(read).mockRejectedValueOnce(new Error("IndexedDB unavailable"))

        const storage = createEncryptedIdbStorage<typeof VALUE.state>(new WebCryptoDeviceKeyAdapter(keys), name)

        expect(await storage.getItem(NAME)).toEqual(VALUE)
        expect(slot).toHaveBeenCalledOnce()
        const db = await openSlicesDatabase(name)
        expect((await db.getAllKeys("slices")).map(String)).toEqual([NAME])
        db.close()
    })
})
