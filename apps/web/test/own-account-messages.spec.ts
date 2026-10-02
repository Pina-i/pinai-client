/**
 * A message from the user's own account is this device's when it holds a copy of it; any other
 * came from one of the user's other devices, and is decrypted and shown like anyone's.
 */
import { describe, expect, it } from "vitest"

import { isHeldHere } from "@pinai/domain/models/own-messages"

const held = [{ id: "optimistic-1" }, { id: "server-2" }]

describe("isHeldHere", () => {
    it("knows a message by the id the client chose or the one the server gave it", () => {
        expect(isHeldHere(held, { messageId: "server-9", clientId: "optimistic-1" }, {})).toBe(true)
        expect(isHeldHere(held, { messageId: "server-2", clientId: null }, {})).toBe(true)
    })

    it("knows a reaction this device applied", () => {
        expect(isHeldHere([], { messageId: "reaction-3" }, { "reaction-3": true })).toBe(true)
    })

    it("takes any other for another device's", () => {
        expect(isHeldHere(held, { messageId: "server-4", clientId: "optimistic-5" }, {})).toBe(false)
        expect(isHeldHere(undefined, { messageId: "server-4" }, {})).toBe(false)
    })
})
