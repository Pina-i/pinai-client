import { describe, expect, it } from "vitest"
import { MAX_GROUP_MEMBERS, seatsLeft } from "@pinai/domain/models/group"

describe("seatsLeft", () => {
    it("leaves room until a group holds fifty, its creator counted", () => {
        expect(MAX_GROUP_MEMBERS).toBe(50)
        expect([1, 49, 50, 51].map(seatsLeft)).toEqual([49, 1, 0, 0])
    })
})
