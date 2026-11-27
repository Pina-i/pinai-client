import { describe, expect, it } from "vitest"
import { rowTime, timeOfDay } from "../src/presentation/_libs/message-time"

const now = new Date(2026, 10, 27, 16, 30)

describe("rowTime", () => {
    it("gives the time today, the weekday this week, the date before", () => {
        const today = new Date(2026, 10, 27, 9, 5).toISOString()
        expect(rowTime(today, now)).toBe(timeOfDay(today))
        const tuesday = new Date(2026, 10, 24, 23, 0)
        expect(rowTime(tuesday.toISOString(), now)).toBe(tuesday.toLocaleDateString(undefined, { weekday: "short" }))
        const older = new Date(2026, 10, 20, 12, 0)
        expect(rowTime(older.toISOString(), now)).toBe(older.toLocaleDateString(undefined, { day: "numeric", month: "short" }))
    })

    it("adds the year only for another year's, and says nothing of a time it can't read", () => {
        const lastYear = new Date(2025, 10, 20, 12, 0)
        expect(rowTime(lastYear.toISOString(), now)).toBe(lastYear.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }))
        expect(rowTime("not a date", now)).toBeNull()
        expect(timeOfDay("not a date")).toBe("")
    })

    it("reads a time ahead of the phone's clock as today's", () => {
        const ahead = new Date(2026, 10, 27, 16, 31).toISOString()
        expect(rowTime(ahead, now)).toBe(timeOfDay(ahead))
    })
})
