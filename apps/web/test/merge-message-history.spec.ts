import { describe, expect, it } from "vitest"
import { addToTimeline, mergeMessageHistory, type Decryption, type TimelineEntry } from "@pinai/domain/models/dm"

type Entry = TimelineEntry & Decryption & { content: string; reactions?: string[] }

function entry(id: string, createdAt: string, content = id): Entry {
    return { id, createdAt, content }
}

const ids = (list: Entry[]) => list.map((m) => m.id)

const YESTERDAY_1 = entry("y1", "2026-09-23T17:00:00Z")
const YESTERDAY_2 = entry("y2", "2026-09-23T17:05:00Z")
const TODAY = entry("t1", "2026-09-24T09:30:00Z")

describe("mergeMessageHistory", () => {
    it("places a message newer than the cache after it (message sent while this device was away)", () => {
        const cached = [YESTERDAY_1, YESTERDAY_2]
        const history = [YESTERDAY_1, YESTERDAY_2, TODAY]

        expect(ids(mergeMessageHistory(cached, history))).toEqual(["y1", "y2", "t1"])
    })

    it("places history older than the cache before it", () => {
        expect(ids(mergeMessageHistory([TODAY], [YESTERDAY_1, YESTERDAY_2]))).toEqual(["y1", "y2", "t1"])
    })

    it("interleaves history and cache by time", () => {
        expect(ids(mergeMessageHistory([YESTERDAY_2], [YESTERDAY_1, TODAY]))).toEqual(["y1", "y2", "t1"])
    })

    it("keeps the cached copy of a message present in both", () => {
        const cached = [entry("y1", YESTERDAY_1.createdAt, "decrypted text")]
        const history = [entry("y1", YESTERDAY_1.createdAt, "ciphertext placeholder")]

        const merged = mergeMessageHistory(cached, history)

        expect(merged).toHaveLength(1)
        expect(merged[0].content).toBe("decrypted text")
    })

    it("takes the decrypted copy over a cached one this device couldn't decrypt, keeping what only the cache knew", () => {
        const placeholder = { ...entry("y1", YESTERDAY_1.createdAt, "[encrypted]"), undecrypted: true as const, reactions: ["👍"] }
        const decrypted = entry("y1", YESTERDAY_1.createdAt, "hello")

        expect(mergeMessageHistory([placeholder], [decrypted])).toEqual([
            { id: "y1", createdAt: YESTERDAY_1.createdAt, content: "hello", reactions: ["👍"] },
        ])
    })

    it("repairs a cache an earlier prepend left out of order", () => {
        expect(ids(mergeMessageHistory([TODAY, YESTERDAY_1, YESTERDAY_2], [TODAY]))).toEqual(["y1", "y2", "t1"])
    })

    it("puts an entry without a usable time first instead of throwing", () => {
        const legacy = entry("legacy", undefined as unknown as string)

        expect(ids(mergeMessageHistory([legacy, TODAY], [YESTERDAY_1]))).toEqual(["legacy", "y1", "t1"])
    })
})

describe("addToTimeline", () => {
    it("appends a message it doesn't hold", () => {
        expect(ids(addToTimeline([YESTERDAY_1], TODAY))).toEqual(["y1", "t1"])
    })

    it("keeps the copy it holds of a message, as the same list", () => {
        const list = [entry("t1", TODAY.createdAt, "hello")]

        expect(addToTimeline(list, entry("t1", TODAY.createdAt, "[encrypted]"))).toBe(list)
    })

    it("keeps the copy it holds when neither could be decrypted, as the same list", () => {
        const list = [{ ...entry("t1", TODAY.createdAt, "[encrypted]"), undecrypted: true as const }]

        expect(addToTimeline(list, { ...entry("t1", TODAY.createdAt, "[encrypted]"), undecrypted: true })).toBe(list)
    })

    it("takes a decrypted copy over one it couldn't decrypt", () => {
        const list = [{ ...entry("t1", TODAY.createdAt, "[encrypted]"), undecrypted: true as const }]

        expect(addToTimeline(list, entry("t1", TODAY.createdAt, "hello"))).toEqual([entry("t1", TODAY.createdAt, "hello")])
    })
})
