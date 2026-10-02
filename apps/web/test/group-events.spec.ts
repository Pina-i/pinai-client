import { describe, expect, it } from "vitest"
import { describeGroupEvent, type GroupEvent } from "@pinai/domain/models/group-event"

const ALICE = "https://idp.alice.example/users/alice_k2m9x"
const DAVE = "https://idp.dave.example/users/dave_p4q8r"
const ME = "https://idp.alice.example/users/bob_z7w3v"

const named: Record<string, string> = { [ALICE]: "Alice", [DAVE]: "Dave", [ME]: "Bob" }

function event(kind: GroupEvent["event"], by: string, extra: Partial<GroupEvent> = {}): GroupEvent {
    return {
        id: "e1",
        conversationId: "g1",
        event: kind,
        actorUri: by,
        actorDisplayName: named[by],
        createdAt: "2026-10-01T12:00:00Z",
        ...extra,
    }
}

const about = (subject: string) => ({ subjectUri: subject, subjectDisplayName: named[subject] })

describe("describeGroupEvent", () => {
    it("names who did what, and to whom", () => {
        expect(describeGroupEvent(event("created", ALICE), ME)).toBe("Alice created the group")
        expect(describeGroupEvent(event("added", ALICE, about(DAVE)), ME)).toBe("Alice added Dave")
        expect(describeGroupEvent(event("removed", ALICE, about(DAVE)), ME)).toBe("Alice removed Dave")
        expect(describeGroupEvent(event("left", DAVE, about(DAVE)), ME)).toBe("Dave left")
        expect(describeGroupEvent(event("renamed", ALICE, { name: "Weekend trip" }), ME)).toBe(
            "Alice renamed the group to “Weekend trip”",
        )
        expect(describeGroupEvent(event("role_changed", ALICE, { ...about(DAVE), role: "admin" }), ME)).toBe(
            "Alice made Dave an admin",
        )
        expect(describeGroupEvent(event("role_changed", ALICE, { ...about(DAVE), role: "member" }), ME)).toBe(
            "Alice removed Dave as admin",
        )
    })

    it("speaks to the reader when they are the one it is about", () => {
        expect(describeGroupEvent(event("added", ALICE, about(ME)), ME)).toBe("Alice added you")
        expect(describeGroupEvent(event("removed", ALICE, about(ME)), ME)).toBe("Alice removed you")
        expect(describeGroupEvent(event("role_changed", ALICE, { ...about(ME), role: "admin" }), ME)).toBe(
            "Alice made you an admin",
        )
    })

    it("speaks to the reader when they did it", () => {
        expect(describeGroupEvent(event("created", ME), ME)).toBe("You created the group")
        expect(describeGroupEvent(event("removed", ME, about(DAVE)), ME)).toBe("You removed Dave")
        expect(describeGroupEvent(event("left", ME, about(ME)), ME)).toBe("You left")
        expect(describeGroupEvent(event("renamed", ME, { name: "Weekend trip" }), ME)).toBe(
            "You renamed the group to “Weekend trip”",
        )
    })

    it("says an admin stepped down when they gave up the role themselves", () => {
        expect(describeGroupEvent(event("role_changed", ALICE, { ...about(ALICE), role: "member" }), ME)).toBe(
            "Alice stepped down as admin",
        )
        expect(describeGroupEvent(event("role_changed", ME, { ...about(ME), role: "member" }), ME)).toBe(
            "You stepped down as admin",
        )
    })

    it("falls back to the handle for someone the instance has no name for", () => {
        const unnamed = { ...event("added", ALICE, { subjectUri: DAVE, subjectDisplayName: null }), actorDisplayName: null }

        expect(describeGroupEvent(unnamed, ME)).toBe("alice_k2m9x added dave_p4q8r")
    })
})
