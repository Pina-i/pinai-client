import { describe, expect, it } from "vitest"
import { MAX_GROUP_NAME_LENGTH, groupRename, mayRenameGroup, newGroupName } from "@pinai/domain/models/group"

const ZWSP = String.fromCodePoint(0x200b)
const ZWJ = String.fromCodePoint(0x200d)

describe("groupRename", () => {
    it("sends the draft trimmed", () => {
        expect(groupRename("  Weekend trip \n", "crew")).toBe("Weekend trip")
    })

    it("names a group that had no name", () => {
        expect(groupRename("Weekend trip", null)).toBe("Weekend trip")
    })

    it("sends nothing for a blank draft, or the name the group already has", () => {
        expect(groupRename("   ", "crew")).toBeNull()
        expect(groupRename("", null)).toBeNull()
        expect(groupRename(" crew ", "crew")).toBeNull()
    })

    it("sends nothing longer than the IdP takes", () => {
        expect(groupRename("a".repeat(MAX_GROUP_NAME_LENGTH), null)).toBe("a".repeat(MAX_GROUP_NAME_LENGTH))
        expect(groupRename("a".repeat(MAX_GROUP_NAME_LENGTH + 1), null)).toBeNull()
    })

    it("counts the limit in characters, an emoji once", () => {
        expect(groupRename("😀".repeat(MAX_GROUP_NAME_LENGTH), null)).toBe("😀".repeat(MAX_GROUP_NAME_LENGTH))
        expect(groupRename("😀".repeat(MAX_GROUP_NAME_LENGTH + 1), null)).toBeNull()
    })

    it("drops the invisible characters the IdP refuses", () => {
        expect(groupRename(`Alice${ZWSP} and Bob${ZWSP}`, "crew")).toBe("Alice and Bob")
        expect(groupRename(`crew${ZWSP}`, "crew")).toBeNull()
    })

    it("sends nothing for a name with nothing readable", () => {
        expect(groupRename(ZWSP, "crew")).toBeNull()
        expect(groupRename(`${ZWJ} ${ZWJ}`, null)).toBeNull()
    })
})

describe("newGroupName", () => {
    it("names the new group as the IdP takes it", () => {
        expect(newGroupName(` Alice and Bob${ZWSP} `)).toEqual({ name: "Alice and Bob" })
        expect(newGroupName("😀".repeat(MAX_GROUP_NAME_LENGTH))).toEqual({ name: "😀".repeat(MAX_GROUP_NAME_LENGTH) })
    })

    it("gives none, titled by its members, for nothing readable", () => {
        expect(newGroupName("")).toEqual({ name: null })
        expect(newGroupName(`${ZWSP}${ZWSP}`)).toEqual({ name: null })
        expect(newGroupName(`${ZWJ}`)).toEqual({ name: null })
    })

    it("sends nothing longer than the IdP takes", () => {
        expect(newGroupName("😀".repeat(MAX_GROUP_NAME_LENGTH + 1))).toBeNull()
        expect(newGroupName(`${"a".repeat(MAX_GROUP_NAME_LENGTH)}${ZWSP}`)).toEqual({ name: "a".repeat(MAX_GROUP_NAME_LENGTH) })
    })
})

describe("mayRenameGroup", () => {
    it("lets any member of a group rename it", () => {
        expect(mayRenameGroup({ kind: "group", removedAt: null })).toBe(true)
    })

    it("never a member removed from it, nor a DM", () => {
        expect(mayRenameGroup({ kind: "group", removedAt: "2026-10-01T12:00:00Z" })).toBe(false)
        expect(mayRenameGroup({ kind: "dm", removedAt: null })).toBe(false)
    })
})
