/**
 * A refusal keeps what the IdP said of it: the status, the code, the words a person can read, and
 * whom it names — a group invitee, say — so the UI can say who couldn't be added.
 */
import { describe, expect, it } from "vitest"

import { toIdpError } from "@pinai/api/idp-error"
import { IdpError } from "@pinai/domain/models/idp-error"

const BOB = "https://idp.bob.test/users/bob_k2m9x"

describe("toIdpError", () => {
    it("keeps the status, the code, the words and whom the refusal names", () => {
        const error = toIdpError(
            403,
            { error: "access_denied", error_description: "Can't add this person", actor_uri: BOB },
            "Failed to create group",
        )

        expect(error).toBeInstanceOf(IdpError)
        expect(error.status).toBe(403)
        expect(error.code).toBe("access_denied")
        expect(error.message).toBe("Can't add this person")
        expect(error.actorUri).toBe(BOB)
    })

    it("falls back to the code when the body has no words", () => {
        const error = toIdpError(400, { error: "invalid_request" }, "Failed to send message")

        expect(error.message).toBe("invalid_request")
        expect(error.actorUri).toBeNull()
    })

    it("names what was being done and the status when the body says nothing", () => {
        for (const body of [{}, "<html>bad gateway</html>", null]) {
            const error = toIdpError(502, body, "Failed to send message")

            expect(error.message).toBe("Failed to send message: 502")
            expect(error.code).toBe("")
        }
    })

    it("ignores fields that aren't strings", () => {
        const error = toIdpError(404, { error: 7, error_description: ["x"], actor_uri: {} }, "Failed")

        expect(error.message).toBe("Failed: 404")
        expect(error.actorUri).toBeNull()
    })
})
