/**
 * Opening a conversation, once for every client: its first history page read, each row this device doesn't hold
 * decrypted once and archived, and the whole page into the conversation's cache in one change.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { UNDECRYPTABLE_TEXT, type ConversationHistory, type DirectMessage } from "@pinai/domain/models/dm"
import type { ApplicationMessage } from "@pinai/domain/models/e2ee"
import type { GroupEvent } from "@pinai/domain/models/group-event"
import { archivedEdit, archivedReaction, archivedText } from "@pinai/domain/models/history-archive"
import type { CachedTimelineMessage, ConversationTimeline, IConversationCache } from "@pinai/domain/ports/conversation-cache.port"
import type { IDmPort } from "@pinai/domain/ports/dm.port"
import { loadConversationUseCase } from "@pinai/domain/usecases/dm/load-conversation.usecase"

const ME = { address: "alice@kauai.pinai", display_name: "Alice", preferred_username: "alice" }
const ME_URI = "https://kauai.pinai/users/alice"
const BOB = "bob@moana.social"
const BOB_URI = "https://moana.social/users/bob"
const SESSION = { idpUrl: "https://kauai.pinai", accessToken: "access-1" }
const T0 = "2026-11-27T10:00:00.000Z"
const T1 = "2026-11-27T10:01:00.000Z"
const T2 = "2026-11-27T10:02:00.000Z"
const NOW = "2026-11-27T11:00:00.000Z"
const FILE = { id: "a1", mime_type: "application/octet-stream", byte_size: 9, original_filename: "encrypted" }

type Row = CachedTimelineMessage & { looks?: string }

function message(overrides: Partial<Row> = {}): Row {
    return { id: "m1", author: "Bob", authorAddress: BOB, content: "kia ora", createdAt: T0, ...overrides }
}

function row(overrides: Partial<DirectMessage> = {}): DirectMessage {
    return {
        id: "m1",
        conversation_id: "c1",
        sender_actor_uri: BOB_URI,
        sender_display_name: "Bob",
        mls_ciphertext: btoa("m1"),
        activity_uri: "",
        federation_status: "delivered",
        created_at: T0,
        edited_at: null,
        reply_to_id: null,
        ...overrides,
    }
}

function groupEvent(id: string, createdAt: string): GroupEvent {
    return { id, conversationId: "c1", event: "renamed", actorUri: BOB_URI, actorDisplayName: "Bob", name: "Whānau", createdAt }
}

const text = (body: unknown): ApplicationMessage => ({ version: 1, kind: "text", body })
const reaction = (body: unknown): ApplicationMessage => ({ version: 1, kind: "reaction", body })
const edit = (body: unknown): ApplicationMessage => ({ version: 1, kind: "edit", body })

function memoryCache(held: Partial<ConversationTimeline<Row>> = {}) {
    let timeline: ConversationTimeline<Row> = { messages: [], appliedReactionIds: {}, groupEvents: [], newDeviceLines: [], ...held }
    const update = vi.fn(async (_id: string, change: (t: ConversationTimeline<Row>) => ConversationTimeline<Row>) => {
        timeline = change(timeline)
    })
    const cache: IConversationCache<Row> = {
        read: async () => timeline,
        update,
        conversationIds: async () => ["c1"],
        toCached: (m) => ({ ...m, looks: m.author.slice(0, 2) }),
    }
    return { cache, update, timeline: () => timeline }
}

/** Decrypts each ciphertext by what it names: `btoa(id)` → `byId[id]`. */
function e2ee(byId: Record<string, ApplicationMessage | null> = {}) {
    return {
        decryptInbound: vi.fn(async (_conversationId: string, ciphertext: Uint8Array) => {
            const id = String.fromCharCode(...ciphertext)
            const app = byId[id]
            if (app === undefined) throw new Error("secret deleted")
            return app
        }),
        bufferForArchive: vi.fn(),
        bufferEditForArchive: vi.fn(),
    }
}

function dmPort(history: Partial<ConversationHistory>, order: string[] = []) {
    const getConversation = vi.fn(async () => {
        order.push("history")
        return { messages: [], events: [], ...history }
    })
    return { getConversation } as unknown as IDmPort & { getConversation: typeof getConversation }
}

function load(
    history: Partial<ConversationHistory>,
    deps: { cache: IConversationCache<Row>; e2ee: ReturnType<typeof e2ee> },
    refreshList = vi.fn(),
) {
    const port = dmPort(history)
    return {
        port,
        refreshList,
        done: loadConversationUseCase(SESSION, "c1", ME, { port, refreshList, ...deps }),
    }
}

afterEach(() => vi.useRealTimers())

describe("loadConversationUseCase", () => {
    it("reads the history, decrypts what it doesn't hold with catch-up, archives it and keeps it oldest first", async () => {
        const { cache, timeline } = memoryCache()
        const port = e2ee({ m1: text({ text: "kia ora" }), m2: text({ text: "ka kite" }) })

        const { port: dm, refreshList, done } = load(
            { messages: [row({ id: "m2", mls_ciphertext: btoa("m2"), created_at: T1, attachments: [FILE] }), row()] },
            { cache, e2ee: port },
        )
        await done

        expect(dm.getConversation).toHaveBeenCalledWith(SESSION.idpUrl, SESSION.accessToken, "c1", undefined)
        expect(refreshList).toHaveBeenCalledOnce()
        expect(port.decryptInbound).toHaveBeenCalledWith("c1", Uint8Array.from("m1", (c) => c.charCodeAt(0)), SESSION)
        expect(timeline().messages.map((m) => [m.id, m.content, m.looks])).toEqual([
            ["m1", "kia ora", "Bo"],
            ["m2", "ka kite", "Bo"],
        ])
        expect(port.bufferForArchive).toHaveBeenCalledWith(
            "c1",
            "m2",
            archivedText({ address: BOB, displayName: "Bob" }, T1, { text: "ka kite" }, [FILE]),
        )
    })

    it("changes the cache once for the whole page", async () => {
        const { cache, update } = memoryCache()
        await load({ messages: [row()], events: [groupEvent("e1", T1)] }, { cache, e2ee: e2ee({ m1: text({ text: "kia ora" }) }) }).done

        expect(update).toHaveBeenCalledOnce()
    })

    it("reuses a held copy as it is, never decrypting it again", async () => {
        const held = message({ content: "read live", reactions: [{ emoji: "🌺", count: 1, reacted: true }] })
        const { cache, timeline } = memoryCache({ messages: [held] })
        const port = e2ee()

        await load({ messages: [row()] }, { cache, e2ee: port }).done

        expect(port.decryptInbound).not.toHaveBeenCalled()
        expect(timeline().messages).toEqual([held])
        expect(port.bufferForArchive).not.toHaveBeenCalled()
    })

    it("tries a held placeholder again, its decrypted copy taking its place with what only the cache knew", async () => {
        const placeholder = message({
            content: UNDECRYPTABLE_TEXT,
            undecrypted: true,
            reactions: [{ emoji: "🌺", count: 1, reacted: false }],
        })
        const { cache, timeline } = memoryCache({ messages: [placeholder] })

        await load({ messages: [row()] }, { cache, e2ee: e2ee({ m1: text({ text: "kia ora" }) }) }).done

        expect(timeline().messages).toHaveLength(1)
        expect(timeline().messages[0]).toMatchObject({ content: "kia ora", reactions: [{ emoji: "🌺", count: 1 }] })
        expect(timeline().messages[0].undecrypted).toBeUndefined()
    })

    it("shows nothing for a row that doesn't decrypt: it predates the device, the archive brings it back", async () => {
        const { cache, timeline } = memoryCache()
        const port = e2ee()

        await load({ messages: [row(), row({ id: "m2", mls_ciphertext: "%%%" })] }, { cache, e2ee: port }).done

        expect(timeline().messages).toEqual([])
        expect(port.decryptInbound).toHaveBeenCalledOnce()
        expect(port.bufferForArchive).not.toHaveBeenCalled()
    })

    it("decrypts the account's own row from another of its devices, under the user's name", async () => {
        const { cache, timeline } = memoryCache()

        await load(
            { messages: [row({ sender_actor_uri: ME_URI, sender_display_name: "Old name" })] },
            { cache, e2ee: e2ee({ m1: text({ text: "from my phone" }) }) },
        ).done

        expect(timeline().messages).toMatchObject([{ author: "Alice", authorAddress: ME.address, content: "from my phone" }])
    })

    it("folds a reaction into its message once the page's texts are in, archives it, and never decrypts an applied one", async () => {
        const { cache, timeline } = memoryCache({ appliedReactionIds: { r0: true } })
        const body = { target_message_id: "m1", emoji: "🌺", op: "add" } as const
        const port = e2ee({ m1: text({ text: "kia ora" }), r1: reaction(body), r2: reaction({ ...body, emoji: "🌊" }) })

        await load(
            {
                messages: [
                    row({ id: "r2", mls_ciphertext: btoa("r2"), created_at: T2, sender_actor_uri: ME_URI }),
                    row({ id: "r1", mls_ciphertext: btoa("r1"), created_at: T1 }),
                    row({ id: "r0", mls_ciphertext: btoa("r0"), created_at: T1 }),
                    row(),
                ],
            },
            { cache, e2ee: port },
        ).done

        expect(port.decryptInbound).toHaveBeenCalledTimes(3)
        expect(timeline().messages).toHaveLength(1)
        expect(timeline().messages[0].reactions).toEqual([
            { emoji: "🌺", count: 1, reacted: false },
            { emoji: "🌊", count: 1, reacted: true },
        ])
        expect(timeline().appliedReactionIds).toEqual({ r0: true, r1: true, r2: true })
        expect(port.bufferForArchive).toHaveBeenCalledWith(
            "c1",
            "r1",
            archivedReaction({ address: BOB, displayName: "Bob" }, T1, body),
        )
    })

    it("drops the placeholder of a reaction that didn't decrypt live once history reads it as one", async () => {
        const target = message()
        const placeholder = message({ id: "r1", content: UNDECRYPTABLE_TEXT, undecrypted: true, createdAt: T1 })
        const { cache, timeline } = memoryCache({ messages: [target, placeholder] })
        const port = e2ee({ r1: reaction({ target_message_id: "m1", emoji: "🌺", op: "add" }) })

        await load({ messages: [row({ id: "r1", mls_ciphertext: btoa("r1"), created_at: T1 }), row()] }, { cache, e2ee: port }).done

        expect(timeline().messages.map((m) => m.id)).toEqual(["m1"])
        expect(timeline().messages[0].reactions).toEqual([{ emoji: "🌺", count: 1, reacted: false }])
    })

    it("marks an own message undelivered when the IdP says its delivery failed, over the held copy", async () => {
        vi.useFakeTimers({ toFake: ["Date"] })
        vi.setSystemTime(new Date(NOW))
        const own = message({ author: "Alice", authorAddress: ME.address, status: "sent", statusAt: T0 })
        const { cache, timeline } = memoryCache({ messages: [own] })

        await load(
            { messages: [row({ sender_actor_uri: ME_URI, federation_status: "failed" })] },
            { cache, e2ee: e2ee() },
        ).done

        expect(timeline().messages).toEqual([{ ...own, status: "undelivered", statusAt: NOW }])
    })

    it("merges the group's changes with those held", async () => {
        const held = groupEvent("e1", T0)
        const later = groupEvent("e2", T1)
        const { cache, timeline } = memoryCache({ groupEvents: [held] })

        await load({ events: [later, held] }, { cache, e2ee: e2ee() }).done

        expect(timeline().groupEvents.map((e) => e.id)).toEqual(["e1", "e2"])
    })

    it("shows history's row of an edited message it never held with the edit's text, until a fuller copy comes", async () => {
        const { cache, timeline } = memoryCache()
        const body = { target_message_id: "m1", new_text: "fixed" }
        const port = e2ee({ m1: edit(body) })

        await load({ messages: [row({ edited_at: T1 })] }, { cache, e2ee: port }).done

        expect(timeline().messages).toMatchObject([{ id: "m1", content: "fixed", edited: true, editOnly: true, editedAt: T1 }])
        expect(timeline().messages[0].undecrypted).toBeUndefined()
        expect(port.bufferEditForArchive).toHaveBeenCalledWith(
            "c1",
            Uint8Array.from("m1", (c) => c.charCodeAt(0)),
            archivedEdit({ address: BOB, displayName: "Bob" }, T1, body),
        )
    })

    it("never decrypts a copy known by its last edit again: that edit was read", async () => {
        const editOnly = message({ content: "fixed", edited: true, editOnly: true, editedAt: T1 })
        const { cache, timeline } = memoryCache({ messages: [editOnly] })
        const port = e2ee()

        await load({ messages: [row({ edited_at: T1 })] }, { cache, e2ee: port }).done

        expect(port.decryptInbound).not.toHaveBeenCalled()
        expect(timeline().messages).toEqual([editOnly])
    })

    it("takes a placeholder's place with the edit's text when the message was edited since", async () => {
        const placeholder = message({ content: UNDECRYPTABLE_TEXT, undecrypted: true })
        const { cache, timeline } = memoryCache({ messages: [placeholder] })

        await load(
            { messages: [row({ edited_at: T1 })] },
            { cache, e2ee: e2ee({ m1: edit({ target_message_id: "m1", new_text: "fixed" }) }) },
        ).done

        expect(timeline().messages).toMatchObject([{ content: "fixed", edited: true, editOnly: true }])
        expect(timeline().messages[0].undecrypted).toBeUndefined()
    })

    it("applies an edit made while the device was away to the copy it holds, and archives it under its author", async () => {
        const held = message({ content: "old", reactions: [{ emoji: "🌺", count: 1, reacted: false }] })
        const { cache, timeline } = memoryCache({ messages: [held] })
        const body = { target_message_id: "m1", new_text: "new" }
        const port = e2ee({ m1: edit(body) })

        await load({ messages: [row({ edited_at: T1 })] }, { cache, e2ee: port }).done

        expect(timeline().messages).toEqual([{ ...held, content: "new", edited: true, editedAt: T1 }])
        expect(port.bufferEditForArchive).toHaveBeenCalledWith(
            "c1",
            Uint8Array.from("m1", (c) => c.charCodeAt(0)),
            archivedEdit({ address: BOB, displayName: "Bob" }, T1, body),
        )
    })

    it("tries a held copy's row again only for an edit after the last it read", async () => {
        const port = e2ee({ m1: edit({ target_message_id: "m1", new_text: "newer" }) })
        const read = message({ content: "first fix", edited: true, editedAt: T1 })
        const { cache, timeline } = memoryCache({ messages: [read] })

        await load({ messages: [row({ edited_at: T1 })] }, { cache, e2ee: port }).done
        expect(port.decryptInbound).not.toHaveBeenCalled()

        await load({ messages: [row({ edited_at: T2 })] }, { cache, e2ee: port }).done
        expect(timeline().messages).toEqual([{ ...read, content: "newer", editedAt: T2 }])
    })

    it("doesn't try a copy edited at a time it doesn't know: restored, or edited on this device", async () => {
        const edited = message({ content: "fixed here", edited: true })
        const { cache, timeline } = memoryCache({ messages: [edited] })
        const port = e2ee()

        await load({ messages: [row({ edited_at: T1 })] }, { cache, e2ee: port }).done

        expect(port.decryptInbound).not.toHaveBeenCalled()
        expect(timeline().messages[0]).toBe(edited)
    })

    it("changes nothing of a held copy when the row doesn't decrypt as an edit of it", async () => {
        for (const app of [undefined, edit({ target_message_id: "m9", new_text: "other" }), text({ text: "odd" })]) {
            const held = message({ content: "old" })
            const { cache, timeline } = memoryCache({ messages: [held] })
            const port = e2ee(app === undefined ? {} : { m1: app })

            await load({ messages: [row({ edited_at: T1 })] }, { cache, e2ee: port }).done

            expect(port.decryptInbound).toHaveBeenCalledOnce()
            expect(timeline().messages[0]).toBe(held)
            expect(port.bufferEditForArchive).not.toHaveBeenCalled()
        }
    })

    it("leaves a later edit that came live during the load in place", async () => {
        const { cache, timeline } = memoryCache({ messages: [message({ content: "old" })] })
        const port = e2ee({ m1: edit({ target_message_id: "m1", new_text: "from history" }) })
        port.decryptInbound.mockImplementationOnce(async () => {
            await cache.update("c1", (t) => ({
                ...t,
                messages: t.messages.map((m) => ({ ...m, content: "live", edited: true, editedAt: T2 })),
            }))
            return edit({ target_message_id: "m1", new_text: "from history" })
        })

        await load({ messages: [row({ edited_at: T1 })] }, { cache, e2ee: port }).done

        expect(timeline().messages).toMatchObject([{ content: "live", editedAt: T2 }])
    })

    it("writes nothing when the history doesn't load", async () => {
        const { cache, update } = memoryCache()
        const port = { getConversation: vi.fn(async () => Promise.reject(new Error("offline"))) } as unknown as IDmPort
        const refreshList = vi.fn()

        await expect(
            loadConversationUseCase(SESSION, "c1", ME, { port, refreshList, cache, e2ee: e2ee() }),
        ).rejects.toThrow("offline")
        expect(update).not.toHaveBeenCalled()
        expect(refreshList).not.toHaveBeenCalled()
    })
})
