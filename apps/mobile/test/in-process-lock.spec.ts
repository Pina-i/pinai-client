import { describe, expect, it } from "vitest"
import { inProcessLock } from "../src/adapters/storage/in-process-lock"

describe("inProcessLock", () => {
    it("runs what it's given one at a time, in order, a failure releasing it", async () => {
        const lock = inProcessLock()
        const order: string[] = []
        let release!: () => void
        const first = lock(async () => {
            order.push("first starts")
            await new Promise<void>((resolve) => (release = resolve))
            order.push("first ends")
            return 1
        })
        const second = lock(async () => {
            order.push("second")
            throw new Error("x")
        })
        const third = lock(async () => {
            order.push("third")
            return 3
        })
        await Promise.resolve()
        release()
        expect(await first).toBe(1)
        await expect(second).rejects.toThrow("x")
        expect(await third).toBe(3)
        expect(order).toEqual(["first starts", "first ends", "second", "third"])
    })
})
