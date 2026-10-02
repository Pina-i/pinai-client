import { describe, expect, it } from "vitest"
import { findConversation, startsConversation, type ConversationRef } from "@pinai/domain/models/dm"

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

describe("startsConversation", () => {
    it("starts a private conversation with an address the list doesn't hold", () => {
        expect(startsConversation(MIKA)).toBe(true)
    })

    it("starts nothing for an id the list doesn't hold: a group id is not an address", () => {
        expect(startsConversation("0b9c2f4e-6d1a-4c3b-9e8f-7a6b5c4d3e2f")).toBe(false)
        expect(startsConversation("@idp.example")).toBe(false)
        expect(startsConversation("mika@")).toBe(false)
    })
})
