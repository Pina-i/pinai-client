import { describe, expect, it, vi } from "vitest"

import { IdpError } from "@pinai/domain/models/idp-error"
import { dismissGroupUseCase } from "@pinai/domain/usecases/e2ee/dismiss-group.usecase"

const IDP = "http://localhost:8080"
const GROUP = "conv-1"

describe("dismissGroupUseCase", () => {
    it("clears a group the user was removed from off their list, then drops its keys from the device", async () => {
        const calls: string[] = []
        const groups = { dismissGroup: vi.fn(async () => void calls.push("dismissGroup")) }
        const e2ee = { forgetGroup: vi.fn(async () => void calls.push("forgetGroup")) }

        await dismissGroupUseCase(IDP, "token", GROUP, groups, e2ee)

        expect(calls).toEqual(["dismissGroup", "forgetGroup"])
        expect(groups.dismissGroup).toHaveBeenCalledWith(IDP, "token", GROUP)
        expect(e2ee.forgetGroup).toHaveBeenCalledWith(GROUP)
    })

    it("keeps the keys when the IdP refuses: the user is still in the group", async () => {
        const groups = {
            dismissGroup: vi.fn(async () => {
                throw new IdpError(409, "conflict", "Leave the group first")
            }),
        }
        const e2ee = { forgetGroup: vi.fn(async () => {}) }

        await expect(dismissGroupUseCase(IDP, "token", GROUP, groups, e2ee)).rejects.toThrow("Leave the group first")
        expect(e2ee.forgetGroup).not.toHaveBeenCalled()
    })
})
