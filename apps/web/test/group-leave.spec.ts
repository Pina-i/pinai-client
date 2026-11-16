import { describe, expect, it } from "vitest"
import { mayLeaveGroup, type GroupRole } from "@pinai/domain/models/group"

const ME = "https://a.example/users/me_aaaaa"
const BO = "https://b.example/users/bo_bbbbb"
const CY = "https://a.example/users/cy_ccccc"

const member = (actorUri: string, role: GroupRole) => ({ actorUri, role })

describe("mayLeaveGroup", () => {
    it("keeps the last admin while others remain", () => {
        expect(mayLeaveGroup([member(ME, "admin"), member(BO, "member"), member(CY, "member")], ME)).toBe(false)
    })

    it("lets an admin go when another admin stays", () => {
        expect(mayLeaveGroup([member(ME, "admin"), member(BO, "admin"), member(CY, "member")], ME)).toBe(true)
    })

    it("lets the last admin go when nobody else is left", () => {
        expect(mayLeaveGroup([member(ME, "admin")], ME)).toBe(true)
    })

    it("always lets a member go", () => {
        expect(mayLeaveGroup([member(BO, "admin"), member(ME, "member")], ME)).toBe(true)
    })
})
