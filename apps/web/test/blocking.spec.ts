/**
 * Someone the user blocked can still write in a group they share — the group reads them as
 * before — but nothing of theirs draws the user's attention: no ping, no unread count, no typing.
 */
import { describe, expect, it } from "vitest"

import { blockedAddresses, countsAsUnread, isBlocked } from "@pinai/domain/models/block"

const bob = {
    actor_uri: "https://idp.bob.test/users/bob_k2m9x",
    display_name: "Bob",
    avatar_url: null,
    blocked_at: "2026-10-01T09:00:00Z",
}

describe("isBlocked", () => {
    const blocked = blockedAddresses([bob])

    it("knows a blocked person by their address or their actor URI", () => {
        expect(isBlocked(blocked, "bob_k2m9x@idp.bob.test")).toBe(true)
        expect(isBlocked(blocked, "https://idp.bob.test/users/bob_k2m9x")).toBe(true)
    })

    it("knows nobody else", () => {
        expect(isBlocked(blocked, "carol_k2m9x@idp.bob.test")).toBe(false)
        expect(isBlocked(blockedAddresses([]), "bob_k2m9x@idp.bob.test")).toBe(false)
    })
})

describe("countsAsUnread", () => {
    it("counts a message in a conversation the user isn't reading", () => {
        expect(countsAsUnread(false, false)).toBe(true)
    })

    it("never counts one the user is reading, nor one from someone they blocked", () => {
        expect(countsAsUnread(true, false)).toBe(false)
        expect(countsAsUnread(false, true)).toBe(false)
    })
})
