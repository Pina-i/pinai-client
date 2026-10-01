import { describe, expect, it } from "vitest"
import { isConversationMuted, isMuteAllActive, notificationsAt, setConversationMuted, shouldPingForMessage } from "@pinai/domain/models/mute"

describe("isConversationMuted", () => {
    it("mutes the conversations the user muted, and only those", () => {
        const notifications = { muteAll: false, muteAllUntil: null, mutedConversations: ["dm-1"] }

        expect(isConversationMuted(notifications, "dm-1")).toBe(true)
        expect(isConversationMuted(notifications, "group-1")).toBe(false)
    })

    it("mutes every conversation while everything is muted", () => {
        expect(isConversationMuted({ muteAll: true, muteAllUntil: null, mutedConversations: [] }, "group-1")).toBe(true)
    })
})

describe("isMuteAllActive", () => {
    const NOW = Date.UTC(2026, 9, 1, 14, 0)
    const HOUR = 60 * 60 * 1000

    it("lasts until the user unmutes when it has no end", () => {
        expect(isMuteAllActive({ muteAll: true, muteAllUntil: null, mutedConversations: [] }, NOW + 1000 * HOUR)).toBe(true)
    })

    it("lifts by itself once its end passes", () => {
        const timed = { muteAll: true, muteAllUntil: NOW + HOUR, mutedConversations: [] }

        expect(isMuteAllActive(timed, NOW)).toBe(true)
        expect(isMuteAllActive(timed, NOW + HOUR)).toBe(false)
    })

    it("is off when everything isn't muted, whatever end is left over", () => {
        expect(isMuteAllActive({ muteAll: false, muteAllUntil: NOW + HOUR, mutedConversations: [] }, NOW)).toBe(false)
    })
})

describe("notificationsAt", () => {
    const NOW = Date.UTC(2026, 9, 1, 14, 0)

    it("reads a lapsed mute-all as off, and keeps the conversations' own mutes", () => {
        const lapsed = { muteAll: true, muteAllUntil: NOW - 1, mutedConversations: ["dm-1"] }

        const now = notificationsAt(lapsed, NOW)

        expect(now).toEqual({ muteAll: false, muteAllUntil: null, mutedConversations: ["dm-1"] })
        expect(isConversationMuted(now, "group-1")).toBe(false)
        expect(isConversationMuted(now, "dm-1")).toBe(true)
    })

    it("hands back the same settings while the mute still holds", () => {
        const holding = { muteAll: true, muteAllUntil: NOW + 1, mutedConversations: [] }

        expect(notificationsAt(holding, NOW)).toBe(holding)
    })
})

describe("setConversationMuted", () => {
    it("unmutes with a single unmute, however many times the conversation was muted", () => {
        const start = { muteAll: false, muteAllUntil: null, mutedConversations: ["group-1"] }
        const mutedTwice = setConversationMuted(setConversationMuted(start, "dm-1", true), "dm-1", true)

        const unmuted = setConversationMuted(mutedTwice, "dm-1", false)

        expect(isConversationMuted(mutedTwice, "dm-1")).toBe(true)
        expect(isConversationMuted(unmuted, "dm-1")).toBe(false)
        expect(isConversationMuted(unmuted, "group-1")).toBe(true)
    })
})

describe("shouldPingForMessage", () => {
    const notifications = { muteAll: false, muteAllUntil: null, mutedConversations: ["group-1"] }

    it("pings for a message in a conversation that isn't muted", () => {
        expect(shouldPingForMessage(notifications, "dm-1", "online", false)).toBe(true)
        expect(shouldPingForMessage(notifications, "dm-1", "idle", false)).toBe(true)
    })

    it("stays silent in a muted conversation, or while the user is in do not disturb", () => {
        expect(shouldPingForMessage(notifications, "group-1", "online", false)).toBe(false)
        expect(shouldPingForMessage(notifications, "dm-1", "dnd", false)).toBe(false)
    })

    it("never pings for someone the user blocked, wherever they write", () => {
        expect(shouldPingForMessage(notifications, "dm-1", "online", true)).toBe(false)
    })
})
