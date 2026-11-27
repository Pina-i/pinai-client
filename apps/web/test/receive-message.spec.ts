/**
 * The socket's message pushes, received once for every client: decrypted at most once, kept in the conversation's
 * cache, archived, and what came of a `new_dm` answered for the platform's ping, unread count and read marker.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { UNDECRYPTABLE_TEXT } from "@pinai/domain/models/dm"
import type { ApplicationMessage, AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import { archivedEdit, archivedReaction, archivedText } from "@pinai/domain/models/history-archive"
import type { DmEventPayload } from "@pinai/domain/models/ws"
import type { CachedTimelineMessage, ConversationTimeline, IConversationCache } from "@pinai/domain/ports/conversation-cache.port"
import {
    receiveDeliveryFailureUseCase,
    receiveEditUseCase,
    receiveMessageUseCase,
} from "@pinai/domain/usecases/dm/receive-message.usecase"

const ME = "alice@kauai.pinai"
const ME_URI = "https://kauai.pinai/users/alice"
const BOB = "bob@moana.social"
const BOB_URI = "https://moana.social/users/bob"
const AT = "2026-11-27T10:00:00.000Z"
const CIPHERTEXT = btoa("ciphertext")
const BYTES = Uint8Array.from("ciphertext", (c) => c.charCodeAt(0))
const CATCH_UP = { idpUrl: "https://kauai.pinai", accessToken: "access-1" }
const FILE = { id: "a1", mime_type: "application/octet-stream", byte_size: 9, original_filename: "encrypted" }
const KEY = { id: "a1", key: new Uint8Array([1]), nonce: new Uint8Array([2]) } as unknown as AttachmentBlobKey

type Row = CachedTimelineMessage & { looks?: string }

function message(overrides: Partial<Row> = {}): Row {
    return { id: "m1", author: "Bob", authorAddress: BOB, content: "kia ora", createdAt: AT, ...overrides }
}

function push(overrides: Partial<DmEventPayload> = {}): DmEventPayload {
    return {
        message_id: "m1",
        conversation_id: "c1",
        kind: "dm",
        sender_address: BOB_URI,
        sender_display_name: "Bob",
        mls_ciphertext: CIPHERTEXT,
        created_at: AT,
        ...overrides,
    }
}

const text = (body: unknown): ApplicationMessage => ({ version: 1, kind: "text", body })
const reaction = (body: unknown): ApplicationMessage => ({ version: 1, kind: "reaction", body })
const edit = (body: unknown): ApplicationMessage => ({ version: 1, kind: "edit", body })

/** The conversations held in memory, each change applied as the port says: what it gives back as it was is kept. */
function memoryCache(held: Record<string, Partial<ConversationTimeline<Row>>> = {}) {
    const empty = (): ConversationTimeline<Row> => ({ messages: [], appliedReactionIds: {}, groupEvents: [], newDeviceLines: [] })
    const timelines = new Map(Object.entries(held).map(([id, t]) => [id, { ...empty(), ...t }]))
    const cache: IConversationCache<Row> = {
        read: async (id) => timelines.get(id) ?? empty(),
        update: async (id, change) => {
            const before = timelines.get(id) ?? empty()
            const after = change(before)
            if (after !== before) timelines.set(id, after)
        },
        conversationIds: async () => [...timelines.keys()],
        toCached: (m) => ({ ...m, looks: m.author.slice(0, 2) }),
    }
    return { cache, timeline: (id: string) => timelines.get(id) }
}

function e2ee(decrypt: (conversationId: string) => ApplicationMessage | null = () => null) {
    return {
        decryptInbound: vi.fn(async (conversationId: string, _ciphertext: Uint8Array) => decrypt(conversationId)),
        bufferForArchive: vi.fn(),
        bufferEditForArchive: vi.fn(),
    }
}

const context = { myAddress: ME, catchUp: CATCH_UP }
const NOW = "2026-11-27T10:00:05.000Z"

afterEach(() => vi.useRealTimers())

describe("receiveMessageUseCase", () => {
    it("keeps someone else's text in the cache's shape, archives it, and answers who sent it", async () => {
        const { cache, timeline } = memoryCache()
        const port = e2ee(() => text({ text: "kia ora" }))

        const arrival = await receiveMessageUseCase(push({ attachments: [FILE] }), context, { e2ee: port, cache })

        expect(port.decryptInbound).toHaveBeenCalledWith("c1", BYTES, CATCH_UP)
        expect(timeline("c1")?.messages).toEqual([
            { ...message({ attachments: [FILE] }), attachmentKeys: undefined, looks: "Bo" },
        ])
        expect(port.bufferForArchive).toHaveBeenCalledWith(
            "c1",
            "m1",
            archivedText({ address: BOB, displayName: "Bob" }, AT, { text: "kia ora" }, [FILE]),
        )
        expect(arrival).toEqual({ kind: "message", senderAddress: BOB, mine: false })
    })

    it("keeps one that doesn't decrypt as a placeholder, archiving nothing", async () => {
        for (const port of [e2ee(), { ...e2ee(), decryptInbound: vi.fn(async () => Promise.reject(new Error("no group"))) }]) {
            const { cache, timeline } = memoryCache()

            const arrival = await receiveMessageUseCase(push(), context, { e2ee: port, cache })

            expect(timeline("c1")?.messages).toMatchObject([{ id: "m1", content: UNDECRYPTABLE_TEXT, undecrypted: true }])
            expect(port.bufferForArchive).not.toHaveBeenCalled()
            expect(arrival).toEqual({ kind: "message", senderAddress: BOB, mine: false })
        }
    })

    it("takes a ciphertext that isn't base64 for one that didn't decrypt", async () => {
        const { cache, timeline } = memoryCache()
        const port = e2ee(() => text({ text: "never" }))

        await receiveMessageUseCase(push({ mls_ciphertext: "%%%" }), context, { e2ee: port, cache })

        expect(port.decryptInbound).not.toHaveBeenCalled()
        expect(timeline("c1")?.messages).toMatchObject([{ content: UNDECRYPTABLE_TEXT, undecrypted: true }])
    })

    it("folds a reaction into its message once, records its id, and archives it under the reactor", async () => {
        const { cache, timeline } = memoryCache({ c1: { messages: [message({ id: "m0", author: "Alice", authorAddress: ME })] } })
        const body = { target_message_id: "m0", emoji: "🌺", op: "add" } as const
        const port = e2ee(() => reaction(body))

        const first = await receiveMessageUseCase(push({ message_id: "r1" }), context, { e2ee: port, cache })
        await receiveMessageUseCase(push({ message_id: "r1" }), context, { e2ee: port, cache })

        expect(first).toEqual({ kind: "reaction" })
        expect(timeline("c1")?.messages[0].reactions).toEqual([{ emoji: "🌺", count: 1, reacted: false }])
        expect(timeline("c1")?.appliedReactionIds).toEqual({ r1: true })
        expect(port.bufferForArchive).toHaveBeenCalledWith(
            "c1",
            "r1",
            archivedReaction({ address: BOB, displayName: "Bob" }, AT, body),
        )
    })

    it("records a reaction to a message it doesn't hold, so history adds nothing later", async () => {
        const { cache, timeline } = memoryCache()
        const port = e2ee(() => reaction({ target_message_id: "gone", emoji: "🌺", op: "add" }))

        await receiveMessageUseCase(push({ message_id: "r1" }), context, { e2ee: port, cache })

        expect(timeline("c1")).toMatchObject({ messages: [], appliedReactionIds: { r1: true } })
    })

    it("answers nothing for a reaction it can't read", async () => {
        const { cache, timeline } = memoryCache()
        const port = e2ee(() => reaction({ emoji: "🌺" }))

        expect(await receiveMessageUseCase(push(), context, { e2ee: port, cache })).toEqual({ kind: "nothing" })
        expect(timeline("c1")).toBeUndefined()
        expect(port.bufferForArchive).not.toHaveBeenCalled()
    })

    it("turns its own echo's optimistic copy into the sent one in place, never decrypting it, archived from its text", async () => {
        vi.useFakeTimers({ now: new Date(NOW) })
        const replyTo = { id: "m0", content: "surf?", author: "Bob" }
        const optimistic = message({
            id: "tmp-1",
            author: "Alice",
            authorAddress: ME,
            content: "yes",
            status: "sending",
            replyTo,
            attachmentKeys: { a1: KEY },
        })
        const later = message({ id: "m2" })
        const { cache, timeline } = memoryCache({ c1: { messages: [optimistic, later] } })
        const port = e2ee()

        const arrival = await receiveMessageUseCase(
            push({ message_id: "m9", client_id: "tmp-1", sender_address: ME_URI, sender_display_name: "Alice", attachments: [FILE] }),
            context,
            { e2ee: port, cache },
        )

        expect(arrival).toEqual({ kind: "echo" })
        expect(port.decryptInbound).not.toHaveBeenCalled()
        expect(timeline("c1")?.messages).toEqual([
            {
                id: "m9",
                author: "Alice",
                authorAddress: ME,
                content: "yes",
                createdAt: AT,
                attachments: [FILE],
                status: "sent",
                statusAt: NOW,
                replyTo,
                attachmentKeys: { a1: KEY },
                looks: "Al",
            },
            later,
        ])
        expect(port.bufferForArchive).toHaveBeenCalledWith(
            "c1",
            "m9",
            archivedText(
                { address: ME, displayName: "Alice" },
                AT,
                { text: "yes", reply_meta: { target_message_id: "m0", preview_text: "surf?", preview_sender: "Bob" }, attachments: [KEY] },
                [FILE],
            ),
        )
    })

    it("settles its own echo without a client id: a copy still sending or failed is sent, a sent one left as it is", async () => {
        vi.useFakeTimers({ now: new Date(NOW) })
        const failed = message({ id: "m9", author: "Alice", authorAddress: ME, status: "failed", statusAt: AT })
        const sent = message({ id: "m8", author: "Alice", authorAddress: ME, status: "sent", statusAt: AT })
        const { cache, timeline } = memoryCache({ c1: { messages: [failed, sent] } })
        const port = e2ee()

        expect(await receiveMessageUseCase(push({ message_id: "m9", sender_address: ME_URI }), context, { e2ee: port, cache })).toEqual({ kind: "echo" })
        await receiveMessageUseCase(push({ message_id: "m8", sender_address: ME_URI }), context, { e2ee: port, cache })

        expect(timeline("c1")?.messages[0]).toEqual({ ...failed, status: "sent", statusAt: NOW })
        expect(timeline("c1")?.messages[1]).toBe(sent)
        expect(port.decryptInbound).not.toHaveBeenCalled()
        expect(port.bufferForArchive).not.toHaveBeenCalled()
    })

    it("takes its own reaction, applied here, for its echo", async () => {
        const held = { messages: [message()], appliedReactionIds: { r1: true as const } }
        const { cache, timeline } = memoryCache({ c1: held })
        const before = timeline("c1")
        const port = e2ee()

        expect(await receiveMessageUseCase(push({ message_id: "r1", sender_address: ME_URI }), context, { e2ee: port, cache })).toEqual({ kind: "echo" })
        expect(timeline("c1")).toBe(before)
        expect(port.decryptInbound).not.toHaveBeenCalled()
    })

    it("decrypts one from another of the user's devices like anyone's, answered as theirs", async () => {
        const { cache, timeline } = memoryCache()
        const port = e2ee(() => text({ text: "from my phone" }))

        const arrival = await receiveMessageUseCase(push({ sender_address: ME_URI, sender_display_name: "Alice" }), context, { e2ee: port, cache })

        expect(arrival).toEqual({ kind: "message", senderAddress: ME, mine: true })
        expect(timeline("c1")?.messages).toMatchObject([{ id: "m1", author: "Alice", content: "from my phone" }])
    })

    it("shows nothing for one of the account's own that doesn't decrypt", async () => {
        const { cache, timeline } = memoryCache()

        const arrival = await receiveMessageUseCase(push({ sender_address: ME_URI }), context, { e2ee: e2ee(), cache })

        expect(arrival).toEqual({ kind: "nothing" })
        expect(timeline("c1")).toBeUndefined()
    })
})

describe("receiveEditUseCase", () => {
    const EDITED_AT = "2026-11-27T11:00:00.000Z"
    const pushed = { message_id: "m1", new_mls_ciphertext: CIPHERTEXT, edited_at: EDITED_AT }

    it("tries each conversation until one decrypts an edit of that message, applies it there with its time and archives it under its author", async () => {
        const { cache, timeline } = memoryCache({
            c1: { messages: [message({ id: "m7" })] },
            c2: { messages: [message({ content: "old" })] },
            c3: { messages: [] },
        })
        const port = e2ee((id) => (id === "c1" ? edit({ target_message_id: "m7", new_text: "other" }) : id === "c2" ? edit({ target_message_id: "m1", new_text: "new" }) : null))

        await receiveEditUseCase(pushed, context, { e2ee: port, cache })

        expect(port.decryptInbound.mock.calls.map(([id]) => id)).toEqual(["c1", "c2"])
        expect(port.decryptInbound).toHaveBeenCalledWith("c2", BYTES, CATCH_UP)
        expect(timeline("c2")?.messages).toEqual([message({ content: "new", edited: true, editedAt: EDITED_AT })])
        expect(timeline("c1")?.messages).toEqual([message({ id: "m7" })])
        expect(port.bufferEditForArchive).toHaveBeenCalledWith(
            "c2",
            BYTES,
            archivedEdit({ address: BOB, displayName: "Bob" }, EDITED_AT, { target_message_id: "m1", new_text: "new" }),
        )
    })

    it("leaves one of the user's own messages as it is when the edit doesn't decrypt: this device made it", async () => {
        const own = message({ author: "Alice", authorAddress: ME, content: "mine" })
        const { cache, timeline } = memoryCache({ c1: { messages: [own] } })

        await receiveEditUseCase(pushed, context, { e2ee: e2ee(), cache })

        expect(timeline("c1")?.messages[0]).toBe(own)
    })

    it("marks a peer's message edited with the placeholder when the edit doesn't decrypt, archiving nothing", async () => {
        const { cache, timeline } = memoryCache({ c1: { messages: [message()] } })
        const port = e2ee()

        await receiveEditUseCase(pushed, context, { e2ee: port, cache })

        expect(timeline("c1")?.messages).toEqual([message({ content: UNDECRYPTABLE_TEXT, edited: true })])
        expect(port.bufferEditForArchive).not.toHaveBeenCalled()
    })

    it("applies an edit to a message held without its sender's address, archiving nothing", async () => {
        const { cache, timeline } = memoryCache({ c1: { messages: [message({ authorAddress: undefined })] } })
        const port = e2ee(() => edit({ target_message_id: "m1", new_text: "new" }))

        await receiveEditUseCase(pushed, context, { e2ee: port, cache })

        expect(timeline("c1")?.messages[0]).toMatchObject({ content: "new", edited: true })
        expect(port.bufferEditForArchive).not.toHaveBeenCalled()
    })
})

describe("receiveDeliveryFailureUseCase", () => {
    const FAILED_AT = "2026-11-27T10:05:00.000Z"

    it("turns an own message undelivered wherever it is held", async () => {
        const other = message({ id: "m1", authorAddress: ME, status: "sent" })
        const { cache, timeline } = memoryCache({
            c1: { messages: [other] },
            c2: { messages: [message({ id: "m2", authorAddress: ME, status: "sent" })] },
        })

        await receiveDeliveryFailureUseCase({ message_id: "m2", conversation_id: "c2" }, cache, FAILED_AT)

        expect(timeline("c2")?.messages[0]).toMatchObject({ id: "m2", status: "undelivered", statusAt: FAILED_AT })
        expect(timeline("c1")?.messages[0]).toBe(other)
    })

    it("changes nothing for a message it doesn't hold, nor for one undelivered already", async () => {
        const undelivered = message({ authorAddress: ME, status: "undelivered", statusAt: AT })
        const { cache, timeline } = memoryCache({ c1: { messages: [undelivered] } })
        const before = timeline("c1")

        await receiveDeliveryFailureUseCase({ message_id: "gone", conversation_id: "c1" }, cache, FAILED_AT)
        await receiveDeliveryFailureUseCase({ message_id: "m1", conversation_id: "c1" }, cache, FAILED_AT)

        expect(timeline("c1")).toBe(before)
    })
})
