/**
 * Adding people to a group's MLS state takes one of their KeyPackages. An invitee whose instance
 * hands out none — they blocked the adder, keep strangers out, or their server is down — is taken
 * off the group again, so its roster stops naming someone who could never read it.
 */
import { describe, expect, it, vi } from "vitest"

import { KeyPackageUnavailable } from "@pinai/domain/models/group"
import { distributeGroupKeysUseCase } from "@pinai/domain/usecases/e2ee/distribute-group-keys.usecase"

const IDP = "http://localhost:8080"
const GROUP = "conv-1"
const [BOB, CAROL, DAVE] = [
    "https://idp.bob.test/users/bob_k2m9x",
    "https://idp.carol.test/users/carol_k2m9x",
    "https://idp.dave.test/users/dave_k2m9x",
]

function ports(failFor: Record<string, Error>) {
    const added: string[] = []
    let inFlight = 0
    let overlapped = false
    const e2ee = {
        addContactToGroup: vi.fn(async (_i: string, _t: string, _c: string, actorUri: string) => {
            inFlight += 1
            overlapped ||= inFlight > 1
            await Promise.resolve()
            inFlight -= 1
            if (failFor[actorUri]) throw failFor[actorUri]
            added.push(actorUri)
        }),
    }
    const groups = { removeMember: vi.fn().mockResolvedValue(undefined) }
    return { e2ee, groups, added, overlapped: () => overlapped }
}

describe("distributeGroupKeysUseCase", () => {
    it("takes off whoever's instance hands out no KeyPackage, and keys the others in", async () => {
        const p = ports({ [CAROL]: new KeyPackageUnavailable(CAROL, new Error("Can't add this person")) })

        const outcome = await distributeGroupKeysUseCase(IDP, "tok", GROUP, [BOB, CAROL, DAVE], p.e2ee, p.groups)

        expect(outcome.dropped).toEqual([CAROL])
        expect(p.added).toEqual([BOB, DAVE])
        expect(p.groups.removeMember).toHaveBeenCalledExactlyOnceWith(IDP, "tok", GROUP, CAROL)
    })

    it("keeps a member whose keys failed after the claim: the group's MLS state may already hold them", async () => {
        const p = ports({ [BOB]: new Error("commit refused") })

        const outcome = await distributeGroupKeysUseCase(IDP, "tok", GROUP, [BOB], p.e2ee, p.groups)

        expect(outcome.dropped).toEqual([])
        expect(outcome.failed).toEqual([BOB])
        expect(p.groups.removeMember).not.toHaveBeenCalled()
    })

    it("adds one member at a time, in order: concurrent Add commits race the epoch", async () => {
        const p = ports({})

        await distributeGroupKeysUseCase(IDP, "tok", GROUP, [BOB, CAROL, DAVE], p.e2ee, p.groups)

        expect(p.added).toEqual([BOB, CAROL, DAVE])
        expect(p.overlapped()).toBe(false)
    })

    it("still reports someone it couldn't take off the group", async () => {
        const p = ports({ [BOB]: new KeyPackageUnavailable(BOB, new Error("no package")) })
        p.groups.removeMember.mockRejectedValue(new Error("offline"))

        const outcome = await distributeGroupKeysUseCase(IDP, "tok", GROUP, [BOB], p.e2ee, p.groups)

        expect(outcome.dropped).toEqual([BOB])
    })
})
