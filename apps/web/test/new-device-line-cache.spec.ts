/**
 * The new device's line is kept in the persisted message cache, the only decrypted copy of the
 * history: a cache written before the lines existed reads as it was, a line goes into it beside the
 * messages, once per commit, and one of another shape read back is left alone. The real store,
 * guard and sealed storage, over an in-memory IndexedDB.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import "fake-indexeddb/auto"

import { WebCryptoDeviceKeyAdapter } from "@/adapters/e2ee/device-key.adapter"
import { createEncryptedIdbStorage, slicesDatabaseName } from "@/adapters/storage/encrypted-idb-storage.adapter"
import { IdbKeyValueStore, e2eeDatabaseName } from "@/adapters/storage/idb-key-value-store.adapter"
import { asActorUri } from "@pinai/domain/models/identity"
import { newDeviceLine, type NewDeviceLine } from "@pinai/domain/models/new-device"

const ROW = "pinai-app-state"
const ALICE = asActorUri("https://idp.alice.test/users/alice_k2m9x")
let accounts = 0

const message = {
    id: "m1",
    author: "Alice",
    authorAddress: "alice_k2m9x@idp.alice.test",
    avatar: "AL",
    content: "kia ora",
    timestamp: "10:00",
    createdAt: "2026-11-16T09:00:00Z",
    color: "red",
}
const line = newDeviceLine(
    { conversationId: "c1", epoch: 4, actorUri: ALICE, deviceId: "laptop", createdAt: "2026-11-16T10:00:00Z" },
    "Alice",
)

/** The account's cache as an earlier build left it, then this build's store opened over it, read back. */
async function storeOver(cached: Record<string, unknown>) {
    const account = `https://idp.bob.test/users/bob_${++accounts}`
    const sealing = new WebCryptoDeviceKeyAdapter(new IdbKeyValueStore(e2eeDatabaseName(asActorUri(account))))
    const cache = createEncryptedIdbStorage<Record<string, unknown>>(sealing, slicesDatabaseName(asActorUri(account)))
    await cache.setItem(ROW, { state: cached, version: 1 })
    localStorage.setItem("e2ee_account", account)
    vi.resetModules()
    const { useAppStore } = await import("@/store/store")
    await vi.waitFor(() => expect(useAppStore.persist.hasHydrated()).toBe(true))
    return { useAppStore, readBack: async () => (await cache.getItem(ROW))?.state }
}

afterEach(() => localStorage.clear())

describe("the new device's line in the message cache", () => {
    const before = { dmMessages: { c1: [message] }, appliedReactionIds: {}, groupEvents: {}, dmUnread: { c1: 1 } }

    it("reads a cache from before the lines as it was, and keeps a line beside its messages, once", async () => {
        const { useAppStore, readBack } = await storeOver(before)
        expect(useAppStore.getState().dmMessages).toEqual(before.dmMessages)
        expect(useAppStore.getState().newDeviceLines).toEqual({})

        useAppStore.getState().addNewDeviceLine("c1", line)
        useAppStore.getState().addNewDeviceLine("c1", { ...line, displayName: "Alice A." })

        await vi.waitFor(async () => expect(await readBack()).toEqual({ ...before, newDeviceLines: { c1: [line] } }))
    })

    it("drops a conversation's lines with what it keeps of it", async () => {
        const { useAppStore, readBack } = await storeOver({ ...before, newDeviceLines: { c1: [line] } })

        useAppStore.getState().forgetConversation("c1")

        await vi.waitFor(async () =>
            expect(await readBack()).toEqual({ ...before, dmMessages: {}, groupEvents: {}, newDeviceLines: {} }),
        )
    })

    it("leaves lines of another shape as they are, and the messages with them", async () => {
        const unknown = { c1: { lines: "of a later build" } }
        const { useAppStore, readBack } = await storeOver({ ...before, newDeviceLines: unknown })

        useAppStore.getState().addNewDeviceLine("c1", line)
        useAppStore.getState().addNewDeviceLine("c2", line)

        const kept: Record<string, unknown> = { ...unknown, c2: [line] satisfies NewDeviceLine[] }
        await vi.waitFor(async () => expect(await readBack()).toEqual({ ...before, newDeviceLines: kept }))
    })
})
