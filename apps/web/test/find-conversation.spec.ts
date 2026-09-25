import { describe, expect, it } from "vitest"
import { findConversation, type ConversationRef } from "@pinai/domain/models/dm"

const MIKA = "mika@idp.example"
const privateDm: ConversationRef = { id: "dm-1", kind: "dm", address: MIKA }
const groupWithMika: ConversationRef = { id: "group-1", kind: "group", address: MIKA }

describe("findConversation", () => {
    it("opens the private conversation for a peer's address, even when a group with them is listed first", () => {
        expect(findConversation([groupWithMika, privateDm], MIKA)).toBe(privateDm)
    })

    it("never opens a group by address", () => {
        expect(findConversation([groupWithMika], MIKA)).toBeUndefined()
    })

    it("opens any conversation, group included, by its id", () => {
        expect(findConversation([privateDm, groupWithMika], "group-1")).toBe(groupWithMika)
        expect(findConversation([privateDm, groupWithMika], "dm-1")).toBe(privateDm)
    })

    it("returns nothing for an unknown ref", () => {
        expect(findConversation([privateDm, groupWithMika], "nobody@idp.example")).toBeUndefined()
    })
})
