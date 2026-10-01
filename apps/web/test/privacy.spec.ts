/**
 * Blocks are keyed on actor URIs, which the adapter percent-encodes into the unblock path, so the
 * use cases hand them over intact. The contact setting answers what the IdP saved.
 */
import { describe, expect, it, vi } from "vitest"

import type { IPrivacyPort } from "@pinai/domain/ports/privacy.port"
import { blockUserUseCase } from "@pinai/domain/usecases/privacy/block-user.usecase"
import { getBlocksUseCase } from "@pinai/domain/usecases/privacy/get-blocks.usecase"
import { setContactPolicyUseCase } from "@pinai/domain/usecases/privacy/set-contact-policy.usecase"
import { unblockUserUseCase } from "@pinai/domain/usecases/privacy/unblock-user.usecase"

const IDP = "http://localhost:8080"
const BOB = "https://idp.bob.test/users/bob_k2m9x"

function privacyPort(overrides: Partial<IPrivacyPort> = {}): IPrivacyPort {
    return {
        listBlocks: vi.fn().mockResolvedValue([]),
        block: vi.fn().mockResolvedValue(undefined),
        unblock: vi.fn().mockResolvedValue(undefined),
        setContactPolicy: vi.fn().mockImplementation((_i, _t, policy) => Promise.resolve(policy)),
        ...overrides,
    }
}

describe("blocking someone", () => {
    it("blocks and unblocks them by their actor URI", async () => {
        const port = privacyPort()

        await blockUserUseCase(IDP, "tok", ` ${BOB} `, port)
        await unblockUserUseCase(IDP, "tok", ` ${BOB} `, port)

        expect(port.block).toHaveBeenCalledWith(IDP, "tok", BOB)
        expect(port.unblock).toHaveBeenCalledWith(IDP, "tok", BOB)
    })

    it("refuses an empty actor URI without calling the IdP", async () => {
        const port = privacyPort()

        await expect(blockUserUseCase(IDP, "tok", "  ", port)).rejects.toThrow("cannot be empty")
        await expect(unblockUserUseCase(IDP, "tok", "", port)).rejects.toThrow("cannot be empty")
        expect(port.block).not.toHaveBeenCalled()
        expect(port.unblock).not.toHaveBeenCalled()
    })

    it("passes the IdP's refusal through", async () => {
        const port = privacyPort({ block: vi.fn().mockRejectedValue(new Error("You can't block yourself")) })

        await expect(blockUserUseCase(IDP, "tok", BOB, port)).rejects.toThrow("You can't block yourself")
    })

    it("lists the people blocked as the IdP has them", async () => {
        const entry = { actor_uri: BOB, display_name: "Bob", avatar_url: null, blocked_at: "2026-10-01T09:00:00Z" }
        const port = privacyPort({ listBlocks: vi.fn().mockResolvedValue([entry]) })

        expect(await getBlocksUseCase(IDP, "tok", port)).toEqual([entry])
    })
})

describe("the contact setting", () => {
    it("is saved and answered", async () => {
        const port = privacyPort()

        expect(await setContactPolicyUseCase(IDP, "tok", "friends", port)).toBe("friends")
        expect(port.setContactPolicy).toHaveBeenCalledWith(IDP, "tok", "friends")
    })
})
