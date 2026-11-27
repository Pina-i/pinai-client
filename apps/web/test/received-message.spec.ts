import { describe, expect, it } from "vitest"
import type { DirectMessage } from "@pinai/domain/models/dm"
import type { ApplicationMessage, AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import type { DmEventPayload } from "@pinai/domain/models/ws"
import { editOf, editedSince, historyWire, pushWire, receivedMessage } from "@pinai/domain/models/received-message"

const ME = { address: "alice@kauai.pinai", display_name: "Alice", preferred_username: "alice" }
const BOB_URI = "https://moana.social/users/bob"
const AT = "2026-11-27T10:00:00.000Z"
const EDITED_AT = "2026-11-27T10:05:00.000Z"
const FILE = { id: "a1", mime_type: "application/octet-stream", byte_size: 9, original_filename: "encrypted" }
const KEY = { id: "a1", key: new Uint8Array([1]), nonce: new Uint8Array([2]) } as unknown as AttachmentBlobKey

function row(overrides: Partial<DirectMessage> = {}): DirectMessage {
    return {
        id: "m1",
        conversation_id: "c1",
        sender_actor_uri: BOB_URI,
        sender_display_name: "Bob",
        mls_ciphertext: "",
        activity_uri: "",
        federation_status: "delivered",
        created_at: AT,
        edited_at: null,
        reply_to_id: null,
        ...overrides,
    }
}

function push(overrides: Partial<DmEventPayload> = {}): DmEventPayload {
    return {
        message_id: "m1",
        conversation_id: "c1",
        kind: "dm",
        sender_address: BOB_URI,
        sender_display_name: "Bob",
        mls_ciphertext: "",
        created_at: AT,
        ...overrides,
    }
}

const text = (body: unknown): ApplicationMessage => ({ version: 1, kind: "text", body })
const reaction = (body: unknown): ApplicationMessage => ({ version: 1, kind: "reaction", body })

describe("the sender, as history and a push name them", () => {
    it("names a peer by the IdP's name, the handle when it has none", () => {
        expect(historyWire(row(), ME)).toMatchObject({ senderAddress: "bob@moana.social", senderName: "Bob", mine: false })
        expect(historyWire(row({ sender_display_name: null }), ME).senderName).toBe("bob")
        expect(pushWire(push({ sender_display_name: null }), ME.address).senderName).toBe("bob")
    })

    it("names the account's own history by the user's name, the push by the IdP's", () => {
        const own = "https://kauai.pinai/users/alice"
        expect(historyWire(row({ sender_actor_uri: own, sender_display_name: "Old name" }), ME)).toMatchObject({ senderName: "Alice", mine: true })
        expect(historyWire(row({ sender_actor_uri: own }), { ...ME, display_name: null }).senderName).toBe("alice")
        expect(pushWire(push({ sender_address: own, sender_display_name: "Old name" }), ME.address)).toMatchObject({ senderName: "Old name", mine: true })
    })

    it("takes nobody's for the user's when no one is signed in", () => {
        expect(pushWire(push(), undefined).mine).toBe(false)
    })
})

describe("receivedMessage", () => {
    it("builds a history row's text, marked edited or not", () => {
        expect(receivedMessage(historyWire(row({ attachments: [FILE] }), ME), text({ text: "hi", attachments: [KEY] }), "history")).toStrictEqual({
            kind: "message",
            message: {
                id: "m1",
                author: "Bob",
                authorAddress: "bob@moana.social",
                content: "hi",
                createdAt: AT,
                edited: false,
                attachments: [FILE],
                attachmentKeys: { a1: KEY },
            },
        })
    })

    it("builds a push's text without an edited mark", () => {
        expect(receivedMessage(pushWire(push(), ME.address), text({ text: "hi" }), "live")).toStrictEqual({
            kind: "message",
            message: {
                id: "m1",
                author: "Bob",
                authorAddress: "bob@moana.social",
                content: "hi",
                createdAt: AT,
                attachments: undefined,
                attachmentKeys: undefined,
            },
        })
    })

    it("quotes a reply from its decrypted preview, else leaves a slim hint", () => {
        const meta = { target_message_id: "m0", preview_text: "earlier", preview_sender: "Alice" }
        const quoted = receivedMessage(pushWire(push({ reply_to_id: "m0" }), ME.address), text({ text: "yes", reply_meta: meta }), "live")
        expect(quoted.kind === "message" && quoted.message.replyTo).toEqual({ id: "m0", content: "earlier", author: "Alice" })

        const hint = receivedMessage(historyWire(row({ reply_to_id: "m0" }), ME), text({ text: "yes" }), "history")
        expect(hint.kind === "message" && hint.message.replyTo).toEqual({ id: "m0", content: "", author: "" })

        const unasked = receivedMessage(historyWire(row(), ME), text({ text: "yes", reply_meta: meta }), "history")
        expect(unasked.kind === "message" && "replyTo" in unasked.message).toBe(false)
    })

    it("shows a text body without its text, or a kind no client shows, as the placeholder", () => {
        const empty = receivedMessage(historyWire(row(), ME), text(null), "history")
        expect(empty.kind === "message" && empty.message.content).toBe("[encrypted]")

        const other = receivedMessage(pushWire(push(), ME.address), { version: 1, kind: "system", body: {} }, "live")
        expect(other).toMatchObject({ kind: "message", message: { content: "[encrypted]" } })
        expect(other.kind === "message" && "undecrypted" in other.message).toBe(false)
    })

    it("shows history's row of an edited message with the edit's text, marked edited, editOnly and when", () => {
        const edit: ApplicationMessage = { version: 1, kind: "edit", body: { target_message_id: "m1", new_text: "fixed" } }
        expect(receivedMessage(historyWire(row({ edited_at: EDITED_AT, reply_to_id: "m0", attachments: [FILE] }), ME), edit, "history")).toStrictEqual({
            kind: "edit",
            message: {
                id: "m1",
                author: "Bob",
                authorAddress: "bob@moana.social",
                content: "fixed",
                createdAt: AT,
                edited: true,
                editOnly: true,
                editedAt: EDITED_AT,
                attachments: [FILE],
                attachmentKeys: undefined,
                replyTo: { id: "m0", content: "", author: "" },
            },
        })
    })

    it("keeps the placeholder for an edit of another message, or one without its text, still marked editOnly", () => {
        for (const body of [{ target_message_id: "m9", new_text: "fixed" }, { target_message_id: "m1" }, null]) {
            const edit: ApplicationMessage = { version: 1, kind: "edit", body }
            expect(receivedMessage(historyWire(row({ edited_at: EDITED_AT }), ME), edit, "history")).toMatchObject({
                kind: "edit",
                message: { content: "[encrypted]", edited: true, editOnly: true },
            })
        }
    })

    it("shows nothing for a history row that doesn't decrypt", () => {
        expect(receivedMessage(historyWire(row(), ME), null, "history")).toEqual({ kind: "nothing" })
    })

    it("shows a peer's push that doesn't decrypt as a placeholder history tries again", () => {
        expect(receivedMessage(pushWire(push({ reply_to_id: "m0" }), ME.address), null, "live")).toStrictEqual({
            kind: "message",
            message: {
                id: "m1",
                author: "Bob",
                authorAddress: "bob@moana.social",
                content: "[encrypted]",
                createdAt: AT,
                attachments: undefined,
                attachmentKeys: undefined,
                undecrypted: true,
                replyTo: { id: "m0", content: "", author: "" },
            },
        })
    })

    it("shows nothing for the account's own push that doesn't decrypt", () => {
        expect(receivedMessage(pushWire(push({ sender_address: "https://kauai.pinai/users/alice" }), ME.address), null, "live")).toEqual({ kind: "nothing" })
    })

    it("reads a reaction to fold, by its own id, and whether it is the user's", () => {
        const body = { target_message_id: "m0", emoji: "👍", op: "add" }
        expect(receivedMessage(historyWire(row(), ME), reaction(body), "history")).toEqual({
            kind: "reaction",
            reaction: { reaction_message_id: "m1", target_message_id: "m0", reactor_address: "bob@moana.social", emoji: "👍", op: "add" },
            mine: false,
        })
        const own = receivedMessage(pushWire(push({ sender_address: "https://kauai.pinai/users/alice" }), ME.address), reaction({ ...body, op: "remove" }), "live")
        expect(own).toMatchObject({ kind: "reaction", reaction: { op: "remove", reactor_address: ME.address }, mine: true })
    })

    it("shows nothing for a reaction it can't read", () => {
        const wire = historyWire(row(), ME)
        expect(receivedMessage(wire, reaction(null), "history")).toEqual({ kind: "nothing" })
        expect(receivedMessage(wire, reaction({ target_message_id: "m0", emoji: "👍", op: "toggle" }), "history")).toEqual({ kind: "nothing" })
        expect(receivedMessage(wire, reaction({ target_message_id: 7, emoji: "👍", op: "add" }), "live")).toEqual({ kind: "nothing" })
    })
})

describe("editOf", () => {
    it("reads an edit of that message only", () => {
        const edit = (body: unknown): ApplicationMessage => ({ version: 1, kind: "edit", body })
        expect(editOf(edit({ target_message_id: "m1", new_text: "fixed" }), "m1")).toBe("fixed")
        expect(editOf(edit({ target_message_id: "m2", new_text: "fixed" }), "m1")).toBeNull()
        expect(editOf(edit({ target_message_id: "m1", new_text: 4 }), "m1")).toBeNull()
        expect(editOf(text({ text: "fixed" }), "m1")).toBeNull()
        expect(editOf(null, "m1")).toBeNull()
    })
})

describe("editedSince", () => {
    it("tries a row edited after the edit the held copy last read", () => {
        expect(editedSince({ edited: true, editedAt: AT }, EDITED_AT)).toBe(true)
        expect(editedSince({ edited: true, editedAt: EDITED_AT }, EDITED_AT)).toBe(false)
        expect(editedSince({ edited: true, editedAt: EDITED_AT }, AT)).toBe(false)
    })

    it("tries a copy never edited, not one edited at a time it doesn't know, nor a row never edited", () => {
        expect(editedSince({}, EDITED_AT)).toBe(true)
        expect(editedSince({ edited: false }, EDITED_AT)).toBe(true)
        expect(editedSince({ edited: true }, EDITED_AT)).toBe(false)
        expect(editedSince({}, null)).toBe(false)
    })
})
