import type { GroupEvent } from "@pinai/domain/models/group-event"
import type { CachedTimelineMessage, ConversationTimeline } from "@pinai/domain/ports/conversation-cache.port"
import { describe, expect, it } from "vitest"
import { timelineRows } from "../src/presentation/pages/conversation/timeline-rows"

const ME = "https://kauai.pinai/users/hoku"
const ANA = "https://kauai.pinai/users/ana"

function message(id: string, authorAddress: string, createdAt: Date): CachedTimelineMessage {
    return { id, author: authorAddress.split("@")[0], authorAddress, content: id, createdAt: createdAt.toISOString() }
}

function timeline(
    messages: CachedTimelineMessage[],
    groupEvents: GroupEvent[] = [],
    newDeviceLines: unknown[] = []
): ConversationTimeline<CachedTimelineMessage> {
    return {
        messages,
        appliedReactionIds: {},
        groupEvents,
        newDeviceLines: newDeviceLines as ConversationTimeline<CachedTimelineMessage>["newDeviceLines"],
    }
}

const now = new Date(2026, 10, 27, 18, 0)
const shape = (rows: ReturnType<typeof timelineRows>) =>
    rows.map((row) =>
        row.kind === "message" ? `${row.id}${row.first ? "*" : ""}` : row.kind === "day" ? `day:${row.label}` : `notice:${row.notice.text}`
    )

describe("timelineRows", () => {
    it("runs an author's messages under one name, newest first, a separator at each day", () => {
        const rows = timelineRows(
            timeline([
                message("m1", "ana@kauai.pinai", new Date(2026, 10, 26, 22, 0)),
                message("m2", "ana@kauai.pinai", new Date(2026, 10, 27, 9, 0)),
                message("m3", "ana@kauai.pinai", new Date(2026, 10, 27, 9, 2)),
                message("m4", "hoku@kauai.pinai", new Date(2026, 10, 27, 9, 3)),
            ]),
            ME,
            now
        )
        expect(shape(rows)).toEqual(["m4*", "m3", "m2*", "day:Today", "m1*", "day:Yesterday"])
    })

    it("puts the group's changes and the new-device lines between the messages, each breaking a run", () => {
        const added: GroupEvent = {
            id: "e1",
            conversationId: "c1",
            event: "added",
            actorUri: ME,
            actorDisplayName: "Hōkū",
            subjectUri: ANA,
            subjectDisplayName: "Ana",
            createdAt: new Date(2026, 10, 27, 9, 1).toISOString(),
        }
        const line = { id: "new-device:4:d1", actorUri: ANA, displayName: "Ana", createdAt: new Date(2026, 10, 27, 9, 1, 30).toISOString() }
        const rows = timelineRows(
            timeline(
                [message("m1", "ana@kauai.pinai", new Date(2026, 10, 27, 9, 0)), message("m2", "ana@kauai.pinai", new Date(2026, 10, 27, 9, 2))],
                [added],
                [line, { not: "a line" }]
            ),
            ME,
            now
        )
        expect(shape(rows)).toEqual(["m2*", "notice:⚠ Ana is now writing from a new device.", "notice:You added Ana", "m1*", "day:Today"])
        const notice = rows.find((row) => row.kind === "notice" && row.id === line.id)
        expect(notice?.kind === "notice" && notice.notice.explanation).toContain("Ana")
    })
})
