/**
 * A member taken off a group must also lose its keys: every device of theirs is committed out of
 * the group's MLS state, so nothing sent from then on decrypts for them.
 */
import { describe, expect, it, vi } from "vitest"

import { leavesToRemove, type GroupMember } from "@pinai/domain/models/group"
import { asActorUri } from "@pinai/domain/models/identity"
import { reconcileGroupKeysUseCase } from "@pinai/domain/usecases/e2ee/reconcile-group-keys.usecase"
import { removeGroupMemberUseCase } from "@pinai/domain/usecases/e2ee/remove-group-member.usecase"

const ana = asActorUri("https://idp.test/users/ana")
const bo = asActorUri("https://idp.test/users/bo")
const cy = asActorUri("https://idp.other.test/users/cy")

const leaf = (leafIndex: number, actorUri: typeof ana, deviceId = `d${leafIndex}`) => ({
    leafIndex,
    actorUri,
    deviceId,
})

describe("leavesToRemove", () => {
    it("names every device of someone the roster no longer holds", () => {
        const leaves = [leaf(0, ana), leaf(1, bo), leaf(2, cy), leaf(3, cy), leaf(4, bo)]

        expect(leavesToRemove(leaves, [ana, bo], ana)).toEqual([2, 3])
    })

    it("names nothing from a roster that doesn't hold the user: it isn't this group's as they see it", () => {
        expect(leavesToRemove([leaf(0, ana), leaf(1, cy)], [bo], ana)).toEqual([])
    })
})

const IDP = "http://localhost:8080"
const GROUP = "conv-1"
const member = (actorUri: string, role: GroupMember["role"] = "member"): GroupMember => ({
    actorUri,
    displayName: null,
    avatarUrl: null,
    role,
})

describe("removeGroupMemberUseCase", () => {
    it("takes them off the group, then commits their devices out of it for whoever is left", async () => {
        const calls: string[] = []
        const groups = {
            removeMember: vi.fn(async () => void calls.push("removeMember")),
            listMembers: vi.fn(async () => {
                calls.push("listMembers")
                return [member(ana, "admin"), member(bo)]
            }),
        }
        const e2ee = { pruneGroup: vi.fn(async () => (calls.push("pruneGroup"), { removed: 2 })) }

        const outcome = await removeGroupMemberUseCase(IDP, "token", GROUP, cy, groups, e2ee)

        expect(calls).toEqual(["removeMember", "listMembers", "pruneGroup"])
        expect(groups.removeMember).toHaveBeenCalledWith(IDP, "token", GROUP, cy)
        expect(e2ee.pruneGroup).toHaveBeenCalledWith(IDP, "token", GROUP, [ana, bo])
        expect(outcome).toEqual({ cutOff: true })
    })

    it("keeps the removal when the keys can't follow: an admin's client finishes it later", async () => {
        const groups = {
            removeMember: vi.fn(async () => {}),
            listMembers: vi.fn(async () => [member(ana, "admin")]),
        }
        const e2ee = {
            pruneGroup: vi.fn(async () => {
                throw new Error("epoch taken")
            }),
        }

        await expect(removeGroupMemberUseCase(IDP, "token", GROUP, cy, groups, e2ee)).resolves.toEqual({
            cutOff: false,
        })
    })

    it("changes no keys when the removal itself is refused", async () => {
        const groups = {
            removeMember: vi.fn(async () => {
                throw new Error("Only group admins can do this")
            }),
            listMembers: vi.fn(),
        }
        const e2ee = { pruneGroup: vi.fn() }

        await expect(removeGroupMemberUseCase(IDP, "token", GROUP, cy, groups, e2ee)).rejects.toThrow(
            "Only group admins",
        )
        expect(e2ee.pruneGroup).not.toHaveBeenCalled()
    })
})

describe("reconcileGroupKeysUseCase", () => {
    it("has an admin commit out the devices of whoever left", async () => {
        const groups = { listMembers: vi.fn(async () => [member(ana, "admin"), member(bo)]) }
        const e2ee = { pruneGroup: vi.fn(async () => ({ removed: 1 })) }

        const outcome = await reconcileGroupKeysUseCase(IDP, "token", GROUP, ana, groups, e2ee)

        expect(e2ee.pruneGroup).toHaveBeenCalledWith(IDP, "token", GROUP, [ana, bo])
        expect(outcome).toEqual({ removed: 1 })
    })

    it("leaves it to the admins: another member's client changes nothing", async () => {
        const groups = { listMembers: vi.fn(async () => [member(ana, "admin"), member(bo)]) }
        const e2ee = { pruneGroup: vi.fn() }

        const outcome = await reconcileGroupKeysUseCase(IDP, "token", GROUP, bo, groups, e2ee)

        expect(e2ee.pruneGroup).not.toHaveBeenCalled()
        expect(outcome).toEqual({ removed: 0 })
    })
})
