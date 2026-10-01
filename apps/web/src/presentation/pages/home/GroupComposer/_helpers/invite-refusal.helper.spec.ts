/**
 * When a group can't take someone, the composer names them. It never says more than the IdP did:
 * a block and a contact setting read alike, as "can't be added".
 */
import { describe, expect, it } from "vitest"

import { IdpError } from "@pinai/domain/models/idp-error"

import { droppedNotice, inviteRefusal } from "./invite-refusal.helper"

const BOB = "https://idp.bob.test/users/bob_k2m9x"
const nameOf = (actorUri: string) => (actorUri === BOB ? "Bob" : null)
const refusal = (status: number, words: string) => new IdpError(status, "access_denied", words, BOB)

describe("inviteRefusal", () => {
    it("names who can't be added, whatever kept them out", () => {
        expect(inviteRefusal(refusal(403, "Can't add this person"), nameOf)).toBe("Bob can't be added.")
    })

    it("tells the user it's their own block, which they can lift", () => {
        expect(inviteRefusal(refusal(403, "You blocked this user"), nameOf)).toBe(
            "You blocked Bob. Unblock them to add them.",
        )
    })

    it("says when the account is gone or its server didn't answer", () => {
        expect(inviteRefusal(new IdpError(404, "not_found", "User not found", BOB), nameOf)).toBe(
            "Bob's account wasn't found.",
        )
        expect(
            inviteRefusal(new IdpError(502, "bad_gateway", "the account's instance did not answer", BOB), nameOf),
        ).toBe("Bob's server didn't answer.")
    })

    it("falls back to the IdP's words, or to someone unnamed", () => {
        expect(inviteRefusal(new IdpError(400, "invalid_request", "A group needs at least one other member"), nameOf)).toBe(
            "A group needs at least one other member",
        )
        expect(inviteRefusal(new IdpError(403, "access_denied", "Can't add this person", "https://x.test/users/x"), nameOf)).toBe(
            "This person can't be added.",
        )
        expect(inviteRefusal("boom", nameOf)).toBe("Something went wrong")
    })
})

describe("droppedNotice", () => {
    it("names who was left out of the new group", () => {
        expect(droppedNotice([BOB], nameOf)).toBe("Couldn't add Bob.")
        expect(droppedNotice([BOB, "https://x.test/users/x"], nameOf)).toBe("Couldn't add Bob and someone else.")
        expect(droppedNotice(["https://x.test/users/x"], nameOf)).toBe("Couldn't add someone.")
        expect(droppedNotice([], nameOf)).toBeNull()
    })
})
