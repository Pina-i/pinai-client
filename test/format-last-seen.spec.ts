import { describe, expect, it } from "vitest"

import { formatLastSeen } from "@/presentation/_libs/format-last-seen"

const NOW = new Date("2026-05-14T12:00:00.000Z")

function isoSecondsAgo(seconds: number): string {
    return new Date(NOW.getTime() - seconds * 1000).toISOString()
}

describe("formatLastSeen", () => {
    it("renders sub-minute deltas as 'just now'", () => {
        expect(formatLastSeen(isoSecondsAgo(0), NOW)).toBe("just now")
        expect(formatLastSeen(isoSecondsAgo(59), NOW)).toBe("just now")
    })

    it("renders minute deltas with singular / plural", () => {
        expect(formatLastSeen(isoSecondsAgo(60), NOW)).toBe("1 minute ago")
        expect(formatLastSeen(isoSecondsAgo(60 * 30), NOW)).toBe("30 minutes ago")
        expect(formatLastSeen(isoSecondsAgo(60 * 59), NOW)).toBe("59 minutes ago")
    })

    it("renders hour deltas with singular / plural", () => {
        expect(formatLastSeen(isoSecondsAgo(60 * 60), NOW)).toBe("1 hour ago")
        expect(formatLastSeen(isoSecondsAgo(60 * 60 * 3), NOW)).toBe("3 hours ago")
        expect(formatLastSeen(isoSecondsAgo(60 * 60 * 23), NOW)).toBe("23 hours ago")
    })

    it("renders the 24-48h window as 'yesterday'", () => {
        expect(formatLastSeen(isoSecondsAgo(60 * 60 * 24), NOW)).toBe("yesterday")
        expect(formatLastSeen(isoSecondsAgo(60 * 60 * 47), NOW)).toBe("yesterday")
    })

    it("renders multi-day deltas under a week", () => {
        expect(formatLastSeen(isoSecondsAgo(60 * 60 * 24 * 2), NOW)).toBe("2 days ago")
        expect(formatLastSeen(isoSecondsAgo(60 * 60 * 24 * 6), NOW)).toBe("6 days ago")
    })

    it("renders week deltas with singular / plural", () => {
        expect(formatLastSeen(isoSecondsAgo(60 * 60 * 24 * 7), NOW)).toBe("1 week ago")
        expect(formatLastSeen(isoSecondsAgo(60 * 60 * 24 * 21), NOW)).toBe("3 weeks ago")
    })

    it("renders month deltas with singular / plural", () => {
        expect(formatLastSeen(isoSecondsAgo(60 * 60 * 24 * 30), NOW)).toBe("1 month ago")
        expect(formatLastSeen(isoSecondsAgo(60 * 60 * 24 * 30 * 6), NOW)).toBe("6 months ago")
    })

    it("renders year deltas with singular / plural", () => {
        expect(formatLastSeen(isoSecondsAgo(60 * 60 * 24 * 365), NOW)).toBe("1 year ago")
        expect(formatLastSeen(isoSecondsAgo(60 * 60 * 24 * 365 * 3), NOW)).toBe("3 years ago")
    })

    it("clamps future timestamps to 'just now' (clock-skew safety)", () => {
        const future = new Date(NOW.getTime() + 60_000).toISOString()
        expect(formatLastSeen(future, NOW)).toBe("just now")
    })
})
