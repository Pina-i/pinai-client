import { describe, expect, it } from "vitest"
import type { Message } from "@/lib/types"
import { lastMessagePreview } from "./last-message-preview.helper"

function msg(overrides: Partial<Message>): Message {
    return {
        id: "1",
        author: "Maia",
        authorAddress: "maia@studio.pinai",
        avatar: "M",
        content: "hello",
        timestamp: "10:00",
        createdAt: "2026-01-01T10:00:00Z",
        color: "#fff",
        ...overrides,
    }
}

const ME = "alice@kauai.pinai"

describe("lastMessagePreview", () => {
    it("returns null when there are no messages", () => {
        expect(lastMessagePreview(undefined, ME)).toBeNull()
        expect(lastMessagePreview([], ME)).toBeNull()
    })

    it("shows the peer's latest message text", () => {
        expect(lastMessagePreview([msg({ content: "hi there" })], ME)).toBe("hi there")
    })

    it("prefixes 'You:' when the latest message is the current user's", () => {
        const m = msg({ authorAddress: ME, content: "sounds good" })
        expect(lastMessagePreview([m], ME)).toBe("You: sounds good")
    })

    it("uses the most recent (last) message in the array", () => {
        const msgs = [msg({ id: "1", content: "old" }), msg({ id: "2", content: "new" })]
        expect(lastMessagePreview(msgs, ME)).toBe("new")
    })

    it("falls back to 'Attachment' when content is empty but attachments exist", () => {
        const m = msg({ content: "", attachments: [{}] as unknown as Message["attachments"] })
        expect(lastMessagePreview([m], ME)).toBe("Attachment")
    })

    it("returns null when content is empty and there are no attachments", () => {
        expect(lastMessagePreview([msg({ content: "" })], ME)).toBeNull()
    })

    it("trims surrounding whitespace", () => {
        expect(lastMessagePreview([msg({ content: "  hi  " })], ME)).toBe("hi")
    })
})
