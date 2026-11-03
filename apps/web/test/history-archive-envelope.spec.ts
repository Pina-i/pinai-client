import { describe, expect, it } from "vitest"

import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import {
    archivedEdit,
    archivedReaction,
    archivedText,
    decodeArchiveEnvelope,
    encodeArchiveEnvelope,
    reactionsToReplay,
    restoredMessages,
    type ArchivedEntry,
} from "@pinai/domain/models/history-archive"

const ALICE = { address: "alice@idp.test", displayName: "Alice" }
const BOB = { address: "bob@idp.test", displayName: "Bob" }

const KEY: AttachmentBlobKey = {
    id: "att-1",
    key: new Uint8Array(32).fill(7),
    nonce: new Uint8Array(12).fill(3),
    original_filename: "cat.gif",
    mime_type: "image/gif",
    byte_size: 1234,
}
const LISTED = { id: "att-1", mime_type: "application/octet-stream", byte_size: 1250, original_filename: "encrypted" }

function text(id: string, at: string, words: string, sender = ALICE, conversationId = "c1"): ArchivedEntry {
    return { conversationId, id, envelope: archivedText(sender, at, { text: words }, undefined) }
}

function edit(id: string, target: string, at: string, words: string, sender = ALICE, conversationId = "c1"): ArchivedEntry {
    return {
        conversationId,
        id,
        envelope: archivedEdit(sender, at, { target_message_id: target, new_text: words }),
    }
}

function reaction(
    id: string,
    target: string,
    at: string,
    emoji: string,
    op: "add" | "remove",
    sender = ALICE,
    conversationId = "c1",
): ArchivedEntry {
    return {
        conversationId,
        id,
        envelope: archivedReaction(sender, at, { target_message_id: target, emoji, op }),
    }
}

describe("the archive envelope", () => {
    it("keeps attachment keys as bytes through JSON", () => {
        const envelope = archivedText(ALICE, "2026-11-01T10:00:00Z", { text: "look", attachments: [KEY] }, [LISTED])
        const decoded = decodeArchiveEnvelope(encodeArchiveEnvelope(envelope))
        const body = decoded?.app.body as { attachments: AttachmentBlobKey[] }
        expect(body.attachments[0].key).toBeInstanceOf(Uint8Array)
        expect(body.attachments[0].key).toEqual(KEY.key)
        expect(body.attachments[0].nonce).toEqual(KEY.nonce)
        expect(decoded?.attachments).toEqual([LISTED])
    })

    it("reads nothing from what this client doesn't write", () => {
        expect(decodeArchiveEnvelope("not json")).toBeNull()
        expect(decodeArchiveEnvelope(JSON.stringify({ v: 2, sender_address: "a", created_at: "t", app: {} }))).toBeNull()
        expect(decodeArchiveEnvelope(JSON.stringify({ v: 1, created_at: "t", app: { kind: "text", body: {} } }))).toBeNull()
    })

    it("leaves out an empty attachment list", () => {
        expect(archivedText(ALICE, "2026-11-01T10:00:00Z", { text: "hi" }, []).attachments).toBeUndefined()
    })
})

describe("restoredMessages", () => {
    it("gives each text once, oldest first, whatever order the archive pages in", () => {
        const restored = restoredMessages([
            text("m2", "2026-11-01T10:02:00Z", "second"),
            text("m1", "2026-11-01T10:01:00Z", "first"),
            text("m1", "2026-11-01T10:01:00Z", "first"),
        ])
        expect(restored.map((m) => m.id)).toEqual(["m1", "m2"])
    })

    it("applies the latest of its sender's edits", () => {
        const [restored] = restoredMessages([
            edit("e2", "m1", "2026-11-01T10:09:00Z", "third take"),
            edit("e1", "m1", "2026-11-01T10:05:00Z", "second take"),
            text("m1", "2026-11-01T10:00:00Z", "first take"),
        ])
        expect(restored).toMatchObject({ text: "third take", edited: true })
    })

    it("ignores an edit by someone else, from another conversation, or of a message it doesn't hold", () => {
        const restored = restoredMessages([
            text("m1", "2026-11-01T10:00:00Z", "mine"),
            edit("e1", "m1", "2026-11-01T10:05:00Z", "forged", BOB),
            edit("e2", "m1", "2026-11-01T10:06:00Z", "elsewhere", ALICE, "c2"),
            edit("e3", "gone", "2026-11-01T10:07:00Z", "orphan"),
        ])
        expect(restored).toHaveLength(1)
        expect(restored[0]).toMatchObject({ text: "mine", edited: false })
    })

    it("restores the attachments, their keys and the reply", () => {
        const [restored] = restoredMessages([
            {
                conversationId: "c1",
                id: "m1",
                envelope: archivedText(
                    ALICE,
                    "2026-11-01T10:00:00Z",
                    {
                        text: "",
                        attachments: [KEY],
                        reply_meta: { target_message_id: "m0", preview_text: "before", preview_sender: "Bob" },
                    },
                    [LISTED],
                ),
            },
        ])
        expect(restored.attachments).toEqual([LISTED])
        expect(restored.attachmentKeys).toEqual([KEY])
        expect(restored.replyTo).toEqual({ id: "m0", content: "before", author: "Bob" })
    })

    it("keeps each reactor's last word on each emoji", () => {
        const [restored] = restoredMessages([
            text("m1", "2026-11-01T10:00:00Z", "news"),
            reaction("r3", "m1", "2026-11-01T10:03:00Z", "👍", "add", ALICE),
            reaction("r2", "m1", "2026-11-01T10:02:00Z", "👍", "remove", ALICE),
            reaction("r1", "m1", "2026-11-01T10:01:00Z", "👍", "add", ALICE),
            reaction("r4", "m1", "2026-11-01T10:04:00Z", "🎉", "add", BOB),
            reaction("r5", "m1", "2026-11-01T10:05:00Z", "🎉", "remove", BOB),
            reaction("r6", "m1", "2026-11-01T10:06:00Z", "👍", "add", BOB),
        ])
        expect(restored.reactions).toEqual([
            { id: "r3", emoji: "👍", reactorAddress: ALICE.address },
            { id: "r6", emoji: "👍", reactorAddress: BOB.address },
        ])
    })

    it("counts a reaction archived twice once", () => {
        const [restored] = restoredMessages([
            text("m1", "2026-11-01T10:00:00Z", "news"),
            reaction("r1", "m1", "2026-11-01T10:01:00Z", "👍", "add"),
            reaction("r1", "m1", "2026-11-01T10:01:00Z", "👍", "add"),
        ])
        expect(restored.reactions).toHaveLength(1)
    })

    it("drops a reaction to a message it doesn't hold, or from another conversation", () => {
        const restored = restoredMessages([
            text("m1", "2026-11-01T10:00:00Z", "news"),
            reaction("r1", "gone", "2026-11-01T10:01:00Z", "👍", "add"),
            reaction("r2", "m1", "2026-11-01T10:02:00Z", "👍", "add", ALICE, "c2"),
        ])
        expect(restored[0].reactions).toEqual([])
    })
})

describe("reactionsToReplay", () => {
    const restored = restoredMessages([
        text("m1", "2026-11-01T10:00:00Z", "held"),
        text("m2", "2026-11-01T10:01:00Z", "a placeholder here"),
        text("m3", "2026-11-01T10:02:00Z", "new here"),
        reaction("r1", "m1", "2026-11-01T10:03:00Z", "👍", "add"),
        reaction("r2", "m2", "2026-11-01T10:04:00Z", "👍", "add"),
        reaction("r3", "m3", "2026-11-01T10:05:00Z", "👍", "add"),
    ])

    it("leaves a decrypted copy's reactions as they are, and gives those of the others", () => {
        const replay = reactionsToReplay([{ id: "m1" }, { id: "m2", undecrypted: true }], restored)
        expect(replay.map((r) => [r.messageId, r.reaction.id])).toEqual([
            ["m2", "r2"],
            ["m3", "r3"],
        ])
    })
})
