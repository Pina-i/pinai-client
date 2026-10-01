import { describe, expect, it } from "vitest"
import {
    clockTime,
    durationLabel,
    minutesUntil,
    muteEndIn,
    muteUntilLabel,
    nextClockTime,
    stepMuteEnd,
} from "@/presentation/organisms/ChannelSidebar/_helpers/mute-end.helper"

// Local time, like the picker: 1 Oct 2026, 14:32:40.
const NOW = new Date(2026, 9, 1, 14, 32, 40).getTime()
const at = (day: number, hours: number, minutes: number) => new Date(2026, 9, day, hours, minutes).getTime()

describe("muteUntilLabel", () => {
    it("names the end, saying so when it falls tomorrow", () => {
        expect(muteUntilLabel(null, NOW)).toBe("until you unmute")
        expect(muteUntilLabel(at(1, 15, 0), NOW)).toBe("until 15:00")
        expect(muteUntilLabel(at(2, 9, 5), NOW)).toBe("until tomorrow 09:05")
    })
})

describe("durationLabel", () => {
    it("reads in minutes under an hour, in hours and minutes past it", () => {
        expect(durationLabel(45)).toBe("45 min")
        expect(durationLabel(60)).toBe("1 h")
        expect(durationLabel(90)).toBe("1 h 30 min")
    })
})

describe("muteEndIn", () => {
    it("lands on the minute, so the end is exactly the time it shows", () => {
        const end = muteEndIn(60, NOW)

        expect(end).toBe(at(1, 15, 32))
        expect(clockTime(end)).toBe("15:32")
        expect(minutesUntil(end, NOW)).toBe(60)
    })
})

describe("stepMuteEnd", () => {
    it("moves on the 15-minute grid", () => {
        expect(minutesUntil(stepMuteEnd(muteEndIn(60, NOW), 15, NOW), NOW)).toBe(75)
        expect(minutesUntil(stepMuteEnd(muteEndIn(20, NOW), 15, NOW), NOW)).toBe(30)
    })

    it("stays between 15 minutes and 24 hours", () => {
        expect(minutesUntil(stepMuteEnd(muteEndIn(15, NOW), -15, NOW), NOW)).toBe(15)
        expect(minutesUntil(stepMuteEnd(muteEndIn(24 * 60, NOW), 15, NOW), NOW)).toBe(24 * 60)
    })
})

describe("nextClockTime", () => {
    it("is today's time while it is still ahead, tomorrow's once it has passed", () => {
        expect(nextClockTime("15", "00", NOW)).toBe(at(1, 15, 0))
        expect(nextClockTime("9", "05", NOW)).toBe(at(2, 9, 5))
        expect(nextClockTime("14", "32", NOW)).toBe(at(2, 14, 32))
    })

    it("refuses what isn't a time of day", () => {
        for (const [hours, minutes] of [["24", "00"], ["12", "60"], ["", "30"], ["1a", "00"]]) {
            expect(nextClockTime(hours, minutes, NOW)).toBeNull()
        }
    })
})
