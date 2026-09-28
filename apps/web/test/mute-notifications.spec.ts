import { describe, expect, it } from "vitest"
import { isConversationMuted, setConversationMuted, shouldPingForMessage } from "@pinai/domain/models/mute"

describe("isConversationMuted", () => {
    it("mutes the conversations the user muted, and only those", () => {
        const notifications = { muteAll: false, mutedConversations: ["dm-1"] }

        expect(isConversationMuted(notifications, "dm-1")).toBe(true)
        expect(isConversationMuted(notifications, "group-1")).toBe(false)
    })

    it("mutes every conversation while everything is muted", () => {
        expect(isConversationMuted({ muteAll: true, mutedConversations: [] }, "group-1")).toBe(true)
    })
})

describe("setConversationMuted", () => {
    it("unmutes with a single unmute, however many times the conversation was muted", () => {
        const start = { muteAll: false, mutedConversations: ["group-1"] }
        const mutedTwice = setConversationMuted(setConversationMuted(start, "dm-1", true), "dm-1", true)

        const unmuted = setConversationMuted(mutedTwice, "dm-1", false)

        expect(isConversationMuted(mutedTwice, "dm-1")).toBe(true)
        expect(isConversationMuted(unmuted, "dm-1")).toBe(false)
        expect(isConversationMuted(unmuted, "group-1")).toBe(true)
    })
})

describe("shouldPingForMessage", () => {
    const notifications = { muteAll: false, mutedConversations: ["group-1"] }

    it("pings for a message in a conversation that isn't muted", () => {
        expect(shouldPingForMessage(notifications, "dm-1", "online")).toBe(true)
        expect(shouldPingForMessage(notifications, "dm-1", "idle")).toBe(true)
    })

    it("stays silent in a muted conversation, or while the user is in do not disturb", () => {
        expect(shouldPingForMessage(notifications, "group-1", "online")).toBe(false)
        expect(shouldPingForMessage(notifications, "dm-1", "dnd")).toBe(false)
    })
})
