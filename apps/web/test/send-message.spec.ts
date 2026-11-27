/**
 * Sending, once for every client: the message shown at once, the device in the conversation before anything is
 * encrypted, the IdP's copy in its place and archived; a failure left to retry, an undelivered one sent again as a new
 * message, and a send left `sending` by a closed page failed when its conversation opens — never one still under way.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { UNDECRYPTABLE_TEXT, type DirectMessage } from "@pinai/domain/models/dm"
import type { ActorUri, AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import { archivedText } from "@pinai/domain/models/history-archive"
import type { CachedTimelineMessage, ConversationTimeline, IConversationCache } from "@pinai/domain/ports/conversation-cache.port"
import type { IDmPort } from "@pinai/domain/ports/dm.port"
import type { IGroupPort } from "@pinai/domain/ports/group.port"
import type { ConversationEntry } from "@pinai/domain/usecases/e2ee/join-conversations.usecase"
import {
    MessageSends,
    type SendContext,
    type SendIntent,
    type SendRoute,
} from "@pinai/domain/usecases/dm/send-message.usecase"

const ME = "alice@kauai.pinai"
const BOB = "bob@moana.social"
const BOB_URI = "https://moana.social/users/bob" as ActorUri
const T0 = "2026-11-27T10:00:00.000Z"
const SENT_AT = "2026-11-27T10:00:01.000Z"
const CIPHERTEXT = Uint8Array.from("ciphertext", (c) => c.charCodeAt(0))
const FILE = { id: "a1", mime_type: "application/octet-stream", byte_size: 9, original_filename: "encrypted" }
const KEY = { id: "a1", key: new Uint8Array([1]), nonce: new Uint8Array([2]) } as unknown as AttachmentBlobKey

type Row = CachedTimelineMessage & { looks?: string }

const DM: SendRoute = { conversationId: "c1", kind: "dm", recipientAddress: BOB, recipientActorUri: BOB_URI }
const GROUP: SendRoute = { conversationId: "c1", kind: "group", recipientAddress: BOB, recipientActorUri: null }

function intent(overrides: Partial<SendIntent> = {}): SendIntent {
    return { ...DM, content: "kia ora", replyTo: null, attachmentIds: [], attachmentKeys: [], ...overrides }
}

function message(overrides: Partial<Row> = {}): Row {
    return { id: "m1", author: "Alice", authorAddress: ME, content: "kia ora", createdAt: T0, ...overrides }
}

function sentRow(overrides: Partial<DirectMessage> = {}): DirectMessage {
    return {
        id: "server-1",
        conversation_id: "c1",
        sender_actor_uri: "https://kauai.pinai/users/alice",
        sender_display_name: "Alice",
        mls_ciphertext: "",
        activity_uri: "",
        federation_status: "pending",
        created_at: SENT_AT,
        edited_at: null,
        reply_to_id: null,
        ...overrides,
    }
}

function memoryCache(held: Row[] = []) {
    let timeline: ConversationTimeline<Row> = { messages: held, appliedReactionIds: {}, groupEvents: [], newDeviceLines: [] }
    const cache: IConversationCache<Row> = {
        read: async () => timeline,
        update: async (_id, change) => {
            timeline = change(timeline)
        },
        conversationIds: async () => ["c1"],
        toCached: (m) => ({ ...m, looks: m.author.slice(0, 2) }),
    }
    return { cache, messages: () => timeline.messages }
}

function harness(held: Row[] = [], entry: () => Promise<ConversationEntry> = async () => "in") {
    const { cache, messages } = memoryCache(held)
    const order: string[] = []
    const ids = ["local-1", "local-2", "local-3"]
    const deps = {
        cache,
        e2ee: {
            encryptOutbound: vi.fn(async () => {
                order.push("encrypt")
                return CIPHERTEXT
            }),
            bufferForArchive: vi.fn(),
            ensureGroupExists: vi.fn(async () => void order.push("founded")),
        },
        dm: { sendMessage: vi.fn(async (..._args: Parameters<IDmPort["sendMessage"]>) => sentRow()) },
        group: { sendGroupMessage: vi.fn(async (..._args: Parameters<IGroupPort["sendGroupMessage"]>) => sentRow()) },
        joins: {
            whenIn: vi.fn(async () => {
                order.push("enter")
                return entry()
            }),
        },
        newId: () => ids.shift()!,
        report: vi.fn(),
    }
    let token: string | null = "access-1"
    const context: SendContext = {
        idpUrl: "https://kauai.pinai",
        accessToken: () => token,
        me: { address: ME, name: "Alice" },
    }
    return {
        deps,
        context,
        order,
        messages,
        sends: new MessageSends(deps),
        signOut: () => {
            token = null
        },
    }
}

afterEach(() => vi.useRealTimers())

describe("MessageSends.send", () => {
    it("shows the message at once as sending, before entering the conversation", async () => {
        let enter!: (entry: ConversationEntry) => void
        const { sends, context, messages } = harness([], () => new Promise((resolve) => (enter = resolve)))

        const sending = sends.send(intent({ replyTo: { id: "m0", content: "hello", author: "Bob" }, attachmentIds: ["a1"], attachmentKeys: [KEY] }), context)
        await vi.waitFor(() => expect(messages()).toHaveLength(1))

        expect(messages()[0]).toMatchObject({
            id: "local-1",
            author: "Alice",
            authorAddress: ME,
            content: "kia ora",
            status: "sending",
            replyTo: { id: "m0", content: "hello", author: "Bob" },
            attachmentKeys: { a1: KEY },
            looks: "Al",
        })
        enter("in")
        await sending
    })

    it("enters, encrypts the text, posts the DM with its client id, and puts the IdP's copy in its place, archived", async () => {
        const { sends, context, deps, order, messages } = harness([message({ id: "m0" })])
        deps.dm.sendMessage.mockResolvedValueOnce(sentRow({ attachments: [FILE] }))
        const replyTo = { id: "m0", content: "hello", author: "Bob" }

        await sends.send(intent({ replyTo, attachmentIds: ["a1"], attachmentKeys: [KEY] }), context)

        const body = {
            text: "kia ora",
            reply_meta: { target_message_id: "m0", preview_text: "hello", preview_sender: "Bob" },
            attachments: [KEY],
        }
        expect(deps.joins.whenIn).toHaveBeenCalledWith(context, "c1")
        expect(deps.e2ee.encryptOutbound).toHaveBeenCalledWith("c1", { version: 1, kind: "text", body })
        expect(deps.dm.sendMessage).toHaveBeenCalledWith(
            "https://kauai.pinai",
            "access-1",
            BOB,
            btoa("ciphertext"),
            "m0",
            ["a1"],
            "c1",
            "local-1",
        )
        expect(order).toEqual(["enter", "encrypt"])
        expect(messages().map((m) => m.id)).toEqual(["m0", "server-1"])
        expect(messages()[1]).toMatchObject({
            content: "kia ora",
            createdAt: SENT_AT,
            attachments: [FILE],
            attachmentKeys: { a1: KEY },
            replyTo,
            status: "sent",
            looks: "Al",
        })
        expect(deps.e2ee.bufferForArchive).toHaveBeenCalledWith(
            "c1",
            "server-1",
            archivedText({ address: ME, displayName: "Alice" }, SENT_AT, body, [FILE]),
        )
    })

    it("founds a DM's group with its first message", async () => {
        const { sends, context, deps, order } = harness([], async () => "no-group")

        await sends.send(intent(), context)

        expect(deps.e2ee.ensureGroupExists).toHaveBeenCalledWith("https://kauai.pinai", "access-1", "c1", BOB_URI)
        expect(order).toEqual(["enter", "founded", "encrypt"])
    })

    it("posts a group's message to the group, which fans it out", async () => {
        const { sends, context, deps, messages } = harness()

        await sends.send(intent({ ...GROUP }), context)

        expect(deps.group.sendGroupMessage).toHaveBeenCalledWith("https://kauai.pinai", "access-1", "c1", btoa("ciphertext"), undefined, undefined)
        expect(deps.dm.sendMessage).not.toHaveBeenCalled()
        expect(messages()).toMatchObject([{ id: "server-1", status: "sent" }])
    })

    it("fails a DM without its peer before entering anything", async () => {
        const { sends, context, deps, messages } = harness()

        await sends.send(intent({ recipientActorUri: null }), context)

        expect(deps.joins.whenIn).not.toHaveBeenCalled()
        expect(deps.e2ee.encryptOutbound).not.toHaveBeenCalled()
        expect(deps.report).toHaveBeenCalledWith("enterConversation", expect.any(Error))
        expect(messages()).toMatchObject([{ id: "local-1", status: "failed" }])
    })

    it("encrypts nothing when the conversation can't be entered", async () => {
        const refused = new Error("refused")
        const { sends, context, deps, messages } = harness([], async () => Promise.reject(refused))

        await sends.send(intent(), context)

        expect(deps.e2ee.encryptOutbound).not.toHaveBeenCalled()
        expect(deps.report).toHaveBeenCalledWith("enterConversation", refused)
        expect(messages()).toMatchObject([{ status: "failed" }])
    })

    it("encrypts nothing once signed out: a ciphertext never sent would leave the members' counters behind", async () => {
        const h = harness([], async () => {
            h.signOut()
            return "in"
        })

        await h.sends.send(intent(), h.context)

        expect(h.deps.e2ee.encryptOutbound).not.toHaveBeenCalled()
        expect(h.messages()).toMatchObject([{ status: "failed" }])
    })

    it("fails at the stage that failed: encrypting posts nothing, a refused post stays to retry", async () => {
        const encrypting = harness()
        encrypting.deps.e2ee.encryptOutbound.mockRejectedValueOnce(new Error("no group"))
        await encrypting.sends.send(intent(), encrypting.context)
        expect(encrypting.deps.dm.sendMessage).not.toHaveBeenCalled()
        expect(encrypting.deps.report).toHaveBeenCalledWith("encryptOutbound", expect.any(Error))
        expect(encrypting.messages()).toMatchObject([{ id: "local-1", status: "failed" }])

        const posting = harness()
        posting.deps.group.sendGroupMessage.mockRejectedValueOnce(new Error("403"))
        await posting.sends.send(intent({ ...GROUP }), posting.context)
        expect(posting.deps.report).toHaveBeenCalledWith("POST /api/groups/:id/messages", expect.any(Error))
        expect(posting.deps.e2ee.bufferForArchive).not.toHaveBeenCalled()
        expect(posting.messages()).toMatchObject([{ id: "local-1", status: "failed" }])
    })
})

describe("MessageSends.retry", () => {
    it("sends a failed message again in place, from the intent it was sent with", async () => {
        const { sends, context, deps, messages } = harness()
        deps.dm.sendMessage.mockRejectedValueOnce(new Error("offline"))
        await sends.send(intent({ attachmentIds: ["a1"], attachmentKeys: [KEY] }), context)

        expect(await sends.retry(DM, "local-1", context)).toBe("retried")

        expect(deps.dm.sendMessage).toHaveBeenLastCalledWith(
            "https://kauai.pinai",
            "access-1",
            BOB,
            btoa("ciphertext"),
            undefined,
            ["a1"],
            "c1",
            "local-1",
        )
        expect(messages()).toMatchObject([{ id: "server-1", status: "sent" }])
    })

    it("rebuilds the intent from the message when this page load never sent it", async () => {
        const failed = message({ id: "local-9", status: "failed", statusAt: T0, attachmentKeys: { a1: KEY } })
        const { sends, context, deps, messages } = harness([failed])

        expect(await sends.retry(DM, "local-9", context)).toBe("retried")

        expect(deps.e2ee.encryptOutbound).toHaveBeenCalledWith("c1", {
            version: 1,
            kind: "text",
            body: { text: "kia ora", attachments: [KEY] },
        })
        expect(deps.dm.sendMessage.mock.calls[0][5]).toEqual(["a1"])
        expect(messages()).toMatchObject([{ id: "server-1", status: "sent" }])
    })

    it("keeps an undelivered message as the record of that attempt, and sends it again as a new one", async () => {
        const undelivered = message({ status: "undelivered", statusAt: T0 })
        const { sends, context, messages } = harness([undelivered])

        expect(await sends.retry(DM, "m1", context)).toBe("resent")

        expect(messages()).toMatchObject([
            { id: "m1", status: "undelivered", resent: true },
            { id: "server-1", status: "sent", resentFrom: "m1" },
        ])
    })

    it("does nothing for a message it can't send again", async () => {
        const placeholder = message({ content: UNDECRYPTABLE_TEXT, status: "undelivered" })
        const { sends, context, deps } = harness([placeholder, message({ id: "m2", status: "failed" })])

        expect(await sends.retry(DM, "m1", context)).toBe("nothing")
        expect(await sends.retry(DM, "gone", context)).toBe("nothing")
        expect(await sends.retry({ ...DM, recipientActorUri: null }, "m2", context)).toBe("nothing")
        expect(deps.e2ee.encryptOutbound).not.toHaveBeenCalled()
    })
})

describe("MessageSends.settleStale", () => {
    it("fails a send a closed page left sending, never one still waiting to enter its conversation", async () => {
        vi.useFakeTimers({ toFake: ["Date"] })
        vi.setSystemTime(new Date(T0))
        let enter!: (entry: ConversationEntry) => void
        const stale = message({ id: "m0", status: "sending", statusAt: T0 })
        const { sends, context, messages } = harness([stale], () => new Promise((resolve) => (enter = resolve)))
        const sending = sends.send(intent(), context)
        await vi.waitFor(() => expect(messages()).toHaveLength(2))

        const later = Date.parse(T0) + 60_000
        await sends.settleStale("c1", later)

        expect(messages()).toMatchObject([
            { id: "m0", status: "failed", statusAt: new Date(later).toISOString() },
            { id: "local-1", status: "sending" },
        ])
        enter("in")
        await sending
    })

    it("leaves the conversation as it is when nothing is stale", async () => {
        const fresh = message({ status: "sending", statusAt: T0 })
        const { sends, messages } = harness([fresh])
        const before = messages()

        await sends.settleStale("c1", Date.parse(T0) + 1_000)

        expect(messages()).toBe(before)
    })
})
