import { describe, expect, it } from "vitest"

import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import type { RestoredMessage } from "@pinai/domain/models/history-archive"
import type { CachedTimelineMessage, ConversationTimeline, IConversationCache } from "@pinai/domain/ports/conversation-cache.port"
import { applyRestoredHistoryUseCase, restoredText, withRestored } from "@pinai/domain/usecases/e2ee/apply-restored-history.usecase"

const ME = "alice@kauai.pinai"
const BOB = "bob@moana.social"
const C1 = "c1"
const C2 = "c2"
const AT = (n: number) => `2026-11-27T10:00:0${n}.000Z`
const KEY: AttachmentBlobKey = {
    id: "a1",
    key: new Uint8Array(32).fill(9),
    nonce: new Uint8Array(12).fill(4),
    original_filename: "reef.jpg",
    mime_type: "image/jpeg",
    byte_size: 1234,
}

type Row = CachedTimelineMessage & { looks?: string }

function restored(n: number, overrides: Partial<RestoredMessage> = {}): RestoredMessage {
    return {
        conversationId: C1,
        id: `m${n}`,
        senderAddress: BOB,
        senderDisplayName: "Bob",
        createdAt: AT(n),
        text: `text ${n}`,
        edited: false,
        attachments: [],
        attachmentKeys: [],
        reactions: [],
        reactionSnapshot: null,
        ...overrides,
    }
}

const empty = (): ConversationTimeline<Row> => ({ messages: [], appliedReactionIds: {}, groupEvents: [], newDeviceLines: [] })
const toCached = (m: Row): Row => ({ ...m, looks: m.author.slice(0, 2) })

function memoryCache(held: Record<string, Partial<ConversationTimeline<Row>>> = {}) {
    const timelines = new Map(Object.entries(held).map(([id, t]) => [id, { ...empty(), ...t }]))
    const updates: string[] = []
    const cache: IConversationCache<Row> = {
        read: async (id) => timelines.get(id) ?? empty(),
        update: async (id, change) => {
            updates.push(id)
            timelines.set(id, change(timelines.get(id) ?? empty()))
        },
        conversationIds: async () => [...timelines.keys()],
        toCached,
    }
    return { cache, updates, timeline: (id: string) => timelines.get(id) }
}

describe("a restored message as a timeline keeps it", () => {
    it("names its sender, keeps its edit mark, its attachments' keys by id and its reply", () => {
        const text = restoredText(
            restored(1, { edited: true, attachmentKeys: [KEY], replyTo: { id: "m0", content: "hi", author: "Alice" } }),
        )
        expect(text).toMatchObject({ id: "m1", author: "Bob", authorAddress: BOB, content: "text 1", edited: true })
        expect(text.attachmentKeys).toEqual({ a1: KEY })
        expect(text.replyTo).toEqual({ id: "m0", content: "hi", author: "Alice" })
    })

    it("takes the handle when the archive kept no name", () => {
        expect(restoredText(restored(1, { senderDisplayName: "  " })).author).toBe("bob")
    })
})

describe("the restored messages into a timeline", () => {
    it("seeds them in time order, a held copy winning", () => {
        const held: ConversationTimeline<Row> = { ...empty(), messages: [{ id: "m2", author: "Bob", authorAddress: BOB, content: "held", createdAt: AT(2) }] }
        const next = withRestored(held, [restored(2), restored(1)], ME, toCached)
        expect(next.messages.map((m) => [m.id, m.content])).toEqual([
            ["m1", "text 1"],
            ["m2", "held"],
        ])
        expect(next.messages[0].looks).toBe("Bo")
    })

    it("replays the reactions of a message it didn't hold whole, recording each id, the user's own marked", () => {
        const placeholder: Row = { id: "m1", author: "Bob", authorAddress: BOB, content: "[encrypted]", createdAt: AT(1), undecrypted: true }
        const next = withRestored(
            { ...empty(), messages: [placeholder] },
            [restored(1, { reactions: [{ id: "r1", emoji: "🌺", reactorAddress: ME }, { id: "r2", emoji: "🌺", reactorAddress: BOB }] })],
            ME,
            toCached,
        )
        expect(next.messages[0].reactions).toEqual([{ emoji: "🌺", count: 2, reacted: true }])
        expect(next.appliedReactionIds).toEqual({ r1: true, r2: true })
    })

    it("leaves a held copy's reactions alone", () => {
        const held: Row = { id: "m1", author: "Bob", authorAddress: BOB, content: "text 1", createdAt: AT(1), reactions: [{ emoji: "👍", count: 1, reacted: false }] }
        const next = withRestored({ ...empty(), messages: [held] }, [restored(1, { reactions: [{ id: "r1", emoji: "🌺", reactorAddress: BOB }] })], ME, toCached)
        expect(next.messages[0].reactions).toEqual([{ emoji: "👍", count: 1, reacted: false }])
        expect(next.appliedReactionIds).toEqual({})
    })

    it("sets a snapshot's counts, applies the reactions since and records those it counted", () => {
        const next = withRestored(
            empty(),
            [
                restored(1, {
                    reactionSnapshot: {
                        reactions: [{ emoji: "👍", count: 3, reacted: false }],
                        since: [{ id: "r9", emoji: "👍", reactorAddress: ME, op: "add" }],
                        counted: ["r1", "r2"],
                    },
                }),
            ],
            ME,
            toCached,
        )
        expect(next.messages[0].reactions).toEqual([{ emoji: "👍", count: 4, reacted: true }])
        expect(next.appliedReactionIds).toEqual({ r9: true, r1: true, r2: true })
    })
})

describe("the archive's messages into the conversation cache", () => {
    it("changes each conversation once and answers which", async () => {
        const { cache, updates, timeline } = memoryCache()
        const touched = await applyRestoredHistoryUseCase([restored(1), restored(2, { conversationId: C2 }), restored(3)], { cache, myAddress: ME })
        expect(touched).toEqual([C1, C2])
        expect(updates).toEqual([C1, C2])
        expect(timeline(C1)?.messages.map((m) => m.id)).toEqual(["m1", "m3"])
        expect(timeline(C2)?.messages.map((m) => m.id)).toEqual(["m2"])
    })

    it("applied twice, holds each message and reaction once", async () => {
        const { cache, timeline } = memoryCache()
        const messages = [restored(1, { reactions: [{ id: "r1", emoji: "🌺", reactorAddress: BOB }] })]
        await applyRestoredHistoryUseCase(messages, { cache, myAddress: ME })
        await applyRestoredHistoryUseCase(messages, { cache, myAddress: ME })
        expect(timeline(C1)?.messages).toHaveLength(1)
        expect(timeline(C1)?.messages[0].reactions).toEqual([{ emoji: "🌺", count: 1, reacted: false }])
    })
})
