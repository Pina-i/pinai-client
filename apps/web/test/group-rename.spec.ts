import { describe, expect, it } from "vitest"
import { MAX_GROUP_NAME_LENGTH, groupRename, mayRenameGroup } from "@pinai/domain/models/group"

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
