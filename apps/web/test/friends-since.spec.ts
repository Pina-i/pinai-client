import { describe, expect, it } from "vitest"

import { formatFriendsSince } from "@/presentation/organisms/PersonProfileModal/_helpers/friends-since.helper"

describe("formatFriendsSince", () => {
    it("dates a friendship from its acceptance, day first", () => {
        expect(formatFriendsSince("2025-01-12T10:00:00Z", "UTC")).toBe("12 Jan 2025")
    })

    it("dates it on the viewer's own calendar", () => {
        expect(formatFriendsSince("2025-01-12T23:30:00Z", "Pacific/Auckland")).toBe("13 Jan 2025")
        expect(formatFriendsSince("2025-01-12T01:30:00Z", "America/New_York")).toBe("11 Jan 2025")
    })

    it("says so for someone who isn't a friend", () => {
        expect(formatFriendsSince(null, "UTC")).toBe("Not friends")
    })
})
