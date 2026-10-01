/**
 * The block list shows people by their display name; an actor this instance never resolved has
 * none, so the handle stands in, as the display-name rule allows only as a last resort.
 */
import { describe, expect, it } from "vitest"

import { blockedPeople } from "./blocked-person.helper"

describe("blockedPeople", () => {
    it("shows each blocked person by name, with their address and avatar", () => {
        expect(
            blockedPeople([
                {
                    actor_uri: "https://idp.bob.test/users/bob_k2m9x",
                    display_name: "Bob",
                    avatar_url: "https://cdn.bob.test/bob.png",
                    blocked_at: "2026-10-01T09:00:00Z",
                },
            ]),
        ).toEqual([
            {
                actorUri: "https://idp.bob.test/users/bob_k2m9x",
                name: "Bob",
                address: "bob_k2m9x@idp.bob.test",
                avatarUrl: "https://cdn.bob.test/bob.png",
            },
        ])
    })

    it("falls back to the handle for someone never resolved", () => {
        const [person] = blockedPeople([
            { actor_uri: "https://idp.dave.test/users/dave_k2m9x", display_name: null, avatar_url: null, blocked_at: "x" },
        ])

        expect(person.name).toBe("dave_k2m9x")
    })
})
