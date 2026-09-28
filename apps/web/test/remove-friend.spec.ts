/**
 * Removing a friend is keyed on their actor URI — the adapter percent-encodes
 * it into the path, so the use case must hand it over intact.
 */
import { describe, expect, it, vi } from "vitest"

import type { ISocialPort } from "@pinai/domain/ports/social.port"
import { removeFriendUseCase } from "@pinai/domain/usecases/social/remove-friend.usecase"

const IDP = "http://localhost:8080"
const FRIEND = "https://idp.bob.test/users/bob_xK9mP"

function socialPort(removeFriend = vi.fn().mockResolvedValue(undefined)) {
    return { removeFriend } as unknown as ISocialPort
}

describe("removeFriendUseCase", () => {
    it("removes the friend by their actor URI", async () => {
        const port = socialPort()

        await removeFriendUseCase(IDP, "tok", ` ${FRIEND} `, port)

        expect(port.removeFriend).toHaveBeenCalledWith(IDP, "tok", FRIEND)
    })

    it("refuses an empty actor URI without calling the IdP", async () => {
        const port = socialPort()

        await expect(removeFriendUseCase(IDP, "tok", "  ", port)).rejects.toThrow("cannot be empty")
        expect(port.removeFriend).not.toHaveBeenCalled()
    })

    it("passes the IdP's error through", async () => {
        const port = socialPort(vi.fn().mockRejectedValue(new Error("Friendship not found")))

        await expect(removeFriendUseCase(IDP, "tok", FRIEND, port)).rejects.toThrow("Friendship not found")
    })
})
