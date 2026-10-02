import { describe, expect, it } from "vitest"
import { interleaveTimeline, type TimelineEntry } from "@pinai/domain/models/dm"

const at = (id: string, createdAt: string): TimelineEntry => ({ id, createdAt })
const ids = (items: ReturnType<typeof interleaveTimeline>) => items.map((item) => `${item.kind}:${item.entry.id}`)

describe("interleaveTimeline", () => {
    it("places each of the group's changes between the messages, by time", () => {
        const messages = [at("m1", "2026-10-01T10:00:00Z"), at("m2", "2026-10-01T10:05:00Z")]
        const events = [
            at("created", "2026-10-01T09:00:00Z"),
            at("added", "2026-10-01T10:02:00Z"),
            at("removed", "2026-10-01T10:10:00Z"),
        ]

        expect(ids(interleaveTimeline(messages, events))).toEqual([
            "event:created",
            "message:m1",
            "event:added",
            "message:m2",
            "event:removed",
        ])
    })

    it("places a change before a message of the same instant, and keeps the messages in their order", () => {
        const messages = [at("late", "2026-10-01T10:05:00Z"), at("early", "2026-10-01T10:01:00Z")]
        const events = [at("renamed", "2026-10-01T10:05:00Z")]

        expect(ids(interleaveTimeline(messages, events))).toEqual(["event:renamed", "message:late", "message:early"])
    })
})
