import type { CachedTimelineMessage, ConversationTimeline } from "@pinai/domain/ports/conversation-cache.port"
import type { IDeviceKeyPort, SealedBytes } from "@pinai/domain/ports/device-key.port"
import { describe, expect, it } from "vitest"
import {
    decodeTimeline,
    encodeTimeline,
    SealedConversationCache,
    type ListingKeyValueStore,
} from "../src/adapters/storage/sealed-conversation-cache.adapter"

const C1 = "11112222-3333-4444-5555-666677778888"
const C2 = "aaaabbbb-cccc-4ddd-8eee-ffff00001111"
const AT = (n: number) => `2026-11-27T10:00:${String(n).padStart(2, "0")}.000Z`

type Message = CachedTimelineMessage

function message(n: number, overrides: Partial<Message> = {}): Message {
    return { id: `m${n}`, author: "Bob", authorAddress: "bob@moana.social", content: `text ${n}`, createdAt: AT(n), ...overrides }
}

const adding =
    (...messages: Message[]) =>
    (t: ConversationTimeline<Message>): ConversationTimeline<Message> => ({ ...t, messages: [...t.messages, ...messages] })

const ids = (t: ConversationTimeline<Message> | undefined) => t?.messages.map((m) => m.id)

/** The account's rows, shared by the caches opened over them as an app run after another would be. */
function memoryStore() {
    const rows = new Map<string, Uint8Array>()
    const at = (collection: string, key: string) => `${collection}/${key}`
    const failing = { get: false, put: false, keys: false }
    const reads: string[] = []
    const writes: string[] = []
    const store: ListingKeyValueStore = {
        get: async (collection, key) => {
            await Promise.resolve()
            reads.push(key)
            if (failing.get) throw new Error("disk I/O error")
            return rows.get(at(collection, key))
        },
        put: async (collection, key, value) => {
            await Promise.resolve()
            if (failing.put) throw new Error("database or disk is full")
            writes.push(key)
            rows.set(at(collection, key), value)
        },
        delete: async (collection, key) => void rows.delete(at(collection, key)),
        clear: async () => rows.clear(),
        keys: async (collection) => {
            if (failing.keys) throw new Error("disk I/O error")
            return [...rows.keys()].filter((k) => k.startsWith(`${collection}/`)).map((k) => k.slice(collection.length + 1))
        },
    }
    return { store, rows, failing, reads, writes, row: (key: string) => rows.get(at("conversations", key)) }
}

/** A device key that opens only what it sealed: a row sealed under another one doesn't open. */
function deviceKey(id = 7): IDeviceKeyPort {
    let nonces = 0
    const mask = (bytes: Uint8Array, nonce: Uint8Array) => bytes.map((b, i) => b ^ nonce[i % nonce.length] ^ id)
    return {
        ready: async () => undefined,
        seal: async (plaintext): Promise<SealedBytes> => {
            const nonce = new Uint8Array(12).fill(++nonces)
            return { nonce, ciphertext: Uint8Array.from([id, ...mask(plaintext, nonce)]) }
        },
        open: async ({ nonce, ciphertext }) => {
            if (ciphertext[0] !== id) throw new Error("bad tag")
            return mask(ciphertext.subarray(1), nonce)
        },
        wipe: async () => undefined,
    }
}

function open(store: ListingKeyValueStore, key = deviceKey()) {
    const reports: string[] = []
    const cache = new SealedConversationCache<Message>({ store, key, toCached: (m) => m, report: (what) => reports.push(what) })
    return { cache, reports }
}

describe("the phone's conversation cache", () => {
    it("reads a conversation's row before its first write, and writes that conversation only", async () => {
        const disk = memoryStore()
        const first = open(disk.store).cache
        await first.update(C1, adding(message(1)))
        await first.update(C2, adding(message(9)))
        await first.saved([C1, C2])
        const c2Before = disk.row(C2)

        const next = open(disk.store).cache
        await next.update(C1, adding(message(2)))
        await next.saved([C1])

        expect(ids(await open(disk.store).cache.read(C1))).toEqual(["m1", "m2"])
        expect(disk.row(C2)).toBe(c2Before)
        expect(disk.writes).toEqual([C1, C2, C1])
    })

    it("keeps an attachment's key and nonce as bytes", async () => {
        const key = Uint8Array.from({ length: 32 }, (_, i) => i)
        const nonce = new Uint8Array(12).fill(250)
        const attached = message(1, {
            attachmentKeys: { a1: { id: "a1", key, nonce, original_filename: "reef.jpg", mime_type: "image/jpeg", byte_size: 1234 } },
        })
        const disk = memoryStore()
        const cache = open(disk.store).cache
        await cache.update(C1, adding(attached))
        await cache.saved([C1])

        const read = (await open(disk.store).cache.read(C1)).messages[0].attachmentKeys?.a1
        expect(read?.key).toBeInstanceOf(Uint8Array)
        expect(read?.nonce).toBeInstanceOf(Uint8Array)
        expect(Array.from(read!.key)).toEqual(Array.from(key))
        expect(Array.from(read!.nonce)).toEqual(Array.from(nonce))
        expect(decodeTimeline(encodeTimeline({ messages: [attached], appliedReactionIds: { r1: true }, groupEvents: [], newDeviceLines: [] }))).toEqual({
            messages: [attached],
            appliedReactionIds: { r1: true },
            groupEvents: [],
            newDeviceLines: [],
        })
    })

    it("never writes over nor deletes a row it can't open, keeps the changes shown and warns once", async () => {
        const disk = memoryStore()
        const before = open(disk.store, deviceKey(1)).cache
        await before.update(C1, adding(message(1)))
        await before.saved([C1])
        const sealedElsewhere = disk.row(C1)

        const { cache, reports } = open(disk.store, deviceKey(2))
        await cache.update(C1, adding(message(2)))
        await cache.update(C1, adding(message(3)))
        await cache.flush()

        expect(disk.row(C1)).toBe(sealedElsewhere)
        expect(disk.writes).toEqual([C1])
        expect(ids(cache.snapshot(C1))).toEqual(["m2", "m3"])
        expect(reports).toHaveLength(1)
        await expect(cache.saved([C1])).rejects.toThrow("can't be read")
    })

    it("never writes over a row it couldn't read, then applies what waited over it once it reads", async () => {
        const disk = memoryStore()
        const before = open(disk.store).cache
        await before.update(C1, adding(message(1)))
        await before.saved([C1])

        const { cache } = open(disk.store)
        disk.failing.get = true
        await cache.update(C1, adding(message(2)))
        expect(ids(await cache.read(C1))).toEqual(["m2"])
        expect(disk.writes).toEqual([C1])

        disk.failing.get = false
        await cache.update(C1, adding(message(3)))
        await cache.saved([C1])
        expect(ids(cache.snapshot(C1))).toEqual(["m1", "m2", "m3"])
        expect(ids(await open(disk.store).cache.read(C1))).toEqual(["m1", "m2", "m3"])
    })

    it("tries a read that failed again at the next flush", async () => {
        const disk = memoryStore()
        const before = open(disk.store).cache
        await before.update(C1, adding(message(1)))
        await before.saved([C1])

        const { cache } = open(disk.store)
        disk.failing.get = true
        await cache.update(C1, adding(message(2)))
        disk.failing.get = false
        await cache.flush()

        expect(ids(await open(disk.store).cache.read(C1))).toEqual(["m1", "m2"])
    })

    it("keeps a change whose write failed in memory and writes it at the next change or flush", async () => {
        const disk = memoryStore()
        const { cache, reports } = open(disk.store)
        disk.failing.put = true
        await cache.update(C1, adding(message(1)))
        expect(ids(cache.snapshot(C1))).toEqual(["m1"])
        await expect(cache.saved([C1])).rejects.toThrow("couldn't be saved")
        expect(disk.row(C1)).toBeUndefined()
        expect(reports.some((r) => r.startsWith("saving the conversation"))).toBe(true)

        disk.failing.put = false
        await cache.update(C1, adding(message(2)))
        await cache.saved([C1])
        expect(ids(await open(disk.store).cache.read(C1))).toEqual(["m1", "m2"])

        disk.failing.put = true
        await cache.update(C1, adding(message(3)))
        await cache.flush()
        disk.failing.put = false
        await cache.flush()
        expect(ids(await open(disk.store).cache.read(C1))).toEqual(["m1", "m2", "m3"])
    })

    it("runs a conversation's changes one at a time, each over the last, its row read once", async () => {
        const disk = memoryStore()
        const { cache } = open(disk.store)
        await Promise.all(Array.from({ length: 20 }, (_, n) => cache.update(C1, adding(message(n)))))
        await cache.saved([C1])
        expect(disk.reads).toEqual([C1])
        expect(disk.writes.length).toBeLessThan(20)

        expect(ids(await open(disk.store).cache.read(C1))).toEqual(Array.from({ length: 20 }, (_, n) => `m${n}`))
    })

    it("writes nothing for a change that changes nothing", async () => {
        const disk = memoryStore()
        const { cache } = open(disk.store)
        await cache.update(C1, (t) => t)
        await cache.flush()
        expect(disk.writes).toEqual([])
    })

    it("tells a conversation's listeners of its changes only", async () => {
        const disk = memoryStore()
        const { cache } = open(disk.store)
        let told = 0
        cache.subscribe(C1, () => told++)
        await cache.update(C1, adding(message(1)))
        const shown = cache.snapshot(C1)
        const toldForC1 = told
        await cache.update(C2, adding(message(2)))
        expect(toldForC1).toBeGreaterThan(0)
        expect(told).toBe(toldForC1)
        expect(cache.snapshot(C1)).toBe(shown)
    })

    it("lists the saved conversations and those only memory holds", async () => {
        const disk = memoryStore()
        const before = open(disk.store).cache
        await before.update(C1, adding(message(1)))
        await before.saved([C1])

        const { cache } = open(disk.store)
        disk.failing.put = true
        await cache.update(C2, adding(message(2)))
        expect((await cache.conversationIds()).sort()).toEqual([C1, C2].sort())
    })

    it("takes nothing once closed, what was under way written", async () => {
        const disk = memoryStore()
        const { cache } = open(disk.store)
        const under = cache.update(C1, adding(message(1)))
        await cache.close()
        await under
        expect(disk.row(C1)).toBeDefined()
        await expect(cache.update(C1, adding(message(2)))).rejects.toThrow("closed")
    })
})
