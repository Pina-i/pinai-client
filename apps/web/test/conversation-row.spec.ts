import { describe, expect, it } from "vitest"
import type { DmConversationSummary } from "@pinai/domain/models/dm"
import { conversationRow, groupFact } from "@pinai/domain/models/conversation-list"

const BOB = { actorUri: "https://moana.social/users/bob", displayName: "Bob", avatarUrl: null }
const ANA = { actorUri: "https://kauai.pinai/users/ana", displayName: null, avatarUrl: null }

function summary(overrides: Partial<DmConversationSummary>): DmConversationSummary {
    return {
        conversation_id: "c1",
        kind: "dm",
        name: null,
        members: [BOB],
        last_message_sender: null,
        unread_count: 0,
        last_message_at: null,
        removed_at: null,
        ...overrides,
    }
}

describe("conversationRow", () => {
    it("names a DM by its other member, routed by their address", () => {
        expect(conversationRow(summary({}))).toEqual({
            id: "c1",
            kind: "dm",
            groupName: null,
            displayName: "Bob",
            address: "bob@moana.social",
            actorUri: BOB.actorUri,
            memberCount: 2,
            memberNames: ["Bob"],
            removedAt: null,
        })
    })

    it("names a DM's member without a name by their handle", () => {
        expect(conversationRow(summary({ members: [ANA] })).displayName).toBe("ana")
    })

    it("names a group by its name, else by its members', a missing one as ?", () => {
        const group = summary({ kind: "group", name: "Wa'a crew", members: [BOB, ANA] })
        expect(conversationRow(group)).toMatchObject({
            kind: "group",
            groupName: "Wa'a crew",
            displayName: "Wa'a crew",
            address: "bob@moana.social",
            actorUri: null,
            memberCount: 3,
            memberNames: ["Bob", "ana"],
        })
        expect(conversationRow({ ...group, name: null }).displayName).toBe("Bob, ?")
    })

    it("routes a conversation nobody else is left in by its id", () => {
        expect(conversationRow(summary({ kind: "group", name: "Solo", members: [] }))).toMatchObject({ address: "c1", memberCount: 1, memberNames: [] })
    })

    it("keeps when the user was removed from a group", () => {
        const at = "2026-11-27T10:00:00.000Z"
        expect(conversationRow(summary({ kind: "group", removed_at: at })).removedAt).toBe(at)
    })
})

describe("groupFact", () => {
    it("counts the group's members, the user included, or says they left it", () => {
        expect(groupFact({ memberCount: 3, removedAt: null })).toBe("3 members")
        expect(groupFact({ memberCount: 1, removedAt: null })).toBe("1 member")
        expect(groupFact({ memberCount: 3, removedAt: "2026-11-27T10:00:00.000Z" })).toBe("no longer a member")
    })
})
