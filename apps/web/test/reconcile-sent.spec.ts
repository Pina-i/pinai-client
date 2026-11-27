import { describe, expect, it } from "vitest"
import { reconcileSent, type SendState } from "@pinai/domain/models/dm"

type Row = SendState & { id: string; content: string }

const before: Row = { id: "m0", content: "earlier", status: "sent" }
const confirmed: Row = { id: "m2", content: "hi", status: "sent" }

describe("reconcileSent", () => {
    it("puts the confirmed copy in its optimistic copy's place", () => {
        const after: Row = { id: "m3", content: "later" }
        const list = [before, { id: "tmp", content: "hi", status: "sending" } as Row, after]

        const next = reconcileSent(list, "tmp", confirmed)

        expect(next).toEqual([before, confirmed, after])
        expect(list[1].id).toBe("tmp")
    })

    it("keeps the link to the undelivered message the optimistic copy was sent again from", () => {
        const optimistic: Row = { id: "tmp", content: "hi", status: "sending", resentFrom: "m1" }

        expect(reconcileSent([optimistic], "tmp", confirmed)).toEqual([{ ...confirmed, resentFrom: "m1" }])
    })

    it("appends the confirmed copy when its optimistic copy is gone", () => {
        expect(reconcileSent([before], "tmp", confirmed)).toEqual([before, confirmed])
        expect(reconcileSent([], "tmp", confirmed)).toEqual([confirmed])
    })

    it("changes nothing when a copy under its id is held already", () => {
        const list = [before, { ...confirmed, status: "undelivered" } as Row]

        expect(reconcileSent(list, "tmp", confirmed)).toBe(list)
    })
})
