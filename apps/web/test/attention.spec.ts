/** What waits for the user: the count the window's title and the app's icon show. */
import { describe, expect, it } from "vitest"

import {
    type AttentionSources,
    attentionCount,
    badgeLabel,
    isBeingRead,
    needsMarkingRead,
    titleWithCount,
    unseenNotifications,
} from "@pinai/domain/models/attention"
import { notificationsAt } from "@pinai/domain/models/mute"
import type { NotificationSettings } from "@pinai/domain/models/user-settings"

const NOTHING_MUTED: NotificationSettings = { muteAll: false, muteAllUntil: null, mutedConversations: [] }

function sources(overrides: Partial<AttentionSources> = {}): AttentionSources {
    return {
        conversations: [
            { id: "dm-alice", removedAt: null },
            { id: "dm-bob", removedAt: null },
            { id: "group-surf", removedAt: null },
        ],
        unread: { "dm-alice": 2, "dm-bob": 1, "group-surf": 4 },
        openId: null,
        windowAttended: true,
        notifications: NOTHING_MUTED,
        bellUnread: 0,
        ...overrides,
    }
}

describe("attentionCount", () => {
    it("adds up the sidebar's unread pills", () => {
        expect(attentionCount(sources())).toBe(7)
    })

    it("leaves out a conversation muted on its own", () => {
        const notifications = { ...NOTHING_MUTED, mutedConversations: ["group-surf"] }

        expect(attentionCount(sources({ notifications }))).toBe(3)
    })

    it("leaves out every conversation while everything is muted, not the bell", () => {
        const notifications = { muteAll: true, muteAllUntil: null, mutedConversations: [] }

        expect(attentionCount(sources({ notifications, bellUnread: 2 }))).toBe(2)
    })

    it("counts them again once a timed mute-all has lapsed", () => {
        const NOW = Date.UTC(2026, 10, 9, 9, 0)
        const timed = { muteAll: true, muteAllUntil: NOW + 60_000, mutedConversations: [] }

        expect(attentionCount(sources({ notifications: notificationsAt(timed, NOW) }))).toBe(0)
        expect(attentionCount(sources({ notifications: notificationsAt(timed, NOW + 60_000) }))).toBe(7)
    })

    it("counts nothing for a group the user was removed from", () => {
        const conversations = [
            { id: "dm-alice", removedAt: null },
            { id: "group-surf", removedAt: "2026-11-08T10:00:00Z" },
        ]

        expect(attentionCount(sources({ conversations }))).toBe(2)
    })

    it("leaves out the conversation being read", () => {
        expect(attentionCount(sources({ openId: "dm-alice" }))).toBe(5)
    })

    it("counts the open conversation while the window isn't attended: nobody is reading it", () => {
        expect(attentionCount(sources({ openId: "dm-alice", windowAttended: false }))).toBe(7)
    })

    it("counts only the conversations the sidebar lists", () => {
        expect(attentionCount(sources({ unread: { "dm-alice": 2, "gone-group": 9 } }))).toBe(2)
    })

    it("adds the bell's unread notifications", () => {
        expect(attentionCount(sources({ bellUnread: 2 }))).toBe(9)
    })

    it("is zero with nothing unread", () => {
        expect(attentionCount(sources({ unread: {} }))).toBe(0)
        expect(attentionCount(sources({ conversations: [], unread: {} }))).toBe(0)
    })
})

describe("isBeingRead", () => {
    it("is open on a window the user is in", () => {
        expect(isBeingRead(true, true)).toBe(true)
    })

    it("is not while the window is hidden or behind another, nor when the conversation isn't open", () => {
        expect(isBeingRead(true, false)).toBe(false)
        expect(isBeingRead(false, true)).toBe(false)
    })
})

describe("needsMarkingRead", () => {
    it("marks when either the local count or the IdP's list has something unread", () => {
        expect(needsMarkingRead(2, 0)).toBe(true)
        expect(needsMarkingRead(0, 3)).toBe(true)
    })

    it("marks nothing when neither has", () => {
        expect(needsMarkingRead(0, 0)).toBe(false)
    })
})

describe("unseenNotifications", () => {
    const request = (id: string) => ({ id })

    it("is every notification before the bell was ever opened", () => {
        expect(unseenNotifications([request("b"), request("a")], new Set())).toEqual([request("b"), request("a")])
    })

    it("is what came since the bell was last opened", () => {
        const seen = new Set(["b", "a"])

        expect(unseenNotifications([request("b"), request("a")], seen)).toEqual([])
        expect(unseenNotifications([request("c"), request("b"), request("a")], seen)).toEqual([request("c")])
    })

    it("still counts a new one after a seen one was accepted or declined", () => {
        const seen = new Set(["b", "a"])
        const afterAccepting = [request("b")]

        expect(unseenNotifications([request("c"), ...afterAccepting], seen)).toEqual([request("c")])
    })

    it("is nothing once everything was marked read", () => {
        expect(unseenNotifications([], new Set())).toEqual([])
    })
})

describe("titleWithCount", () => {
    it("puts the count after the base", () => {
        expect(titleWithCount("Pīna'i", 3)).toBe("Pīna'i (3)")
        expect(titleWithCount("Pīna'i", 120)).toBe("Pīna'i (120)")
    })

    it("is the base alone with nothing waiting", () => {
        expect(titleWithCount("Pīna'i", 0)).toBe("Pīna'i")
    })
})

describe("badgeLabel", () => {
    it("spells the count, 99+ past 99, nothing at 0", () => {
        expect(badgeLabel(0)).toBe("")
        expect(badgeLabel(1)).toBe("1")
        expect(badgeLabel(99)).toBe("99")
        expect(badgeLabel(100)).toBe("99+")
        expect(badgeLabel(4000)).toBe("99+")
    })
})
