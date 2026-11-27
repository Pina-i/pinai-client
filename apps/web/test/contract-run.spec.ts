import { describe, expect, it } from "vitest"

import { alike, type ContractScenario, runScenarios, summaryLine } from "@pinai/domain/lib/contract"

const make = async () => undefined

describe("the contracts' runner", () => {
    it("plays every scenario in order, timed, a failure stopping none", async () => {
        let clock = 0
        const scenarios: ContractScenario<typeof make>[] = [
            { name: "first", run: async () => void (clock += 5) },
            {
                name: "second",
                run: async () => {
                    clock += 3
                    throw new Error("Contract: broken")
                },
            },
            {
                name: "third",
                run: async () => {
                    clock += 2
                    throw "not an Error"
                },
            },
        ]
        const seen: string[] = []

        const results = await runScenarios(
            scenarios,
            make,
            (result) => seen.push(result.name),
            () => clock
        )

        expect(results).toEqual([
            { name: "first", error: null, ms: 5 },
            { name: "second", error: "Contract: broken", ms: 3 },
            { name: "third", error: "not an Error", ms: 2 },
        ])
        expect(seen).toEqual(["first", "second", "third"])
    })

    it("words the line a run ends with, under the check's label", () => {
        const results = [
            { name: "a", error: null, ms: 400.4 },
            { name: "b", error: "Contract: x", ms: 440 },
        ]

        expect(summaryLine("mls-check", results)).toBe("[mls-check] 1/2 passed in 840 ms")
        expect(summaryLine("storage-check", results)).toBe("[storage-check] 1/2 passed in 840 ms")
    })
})

describe("alike", () => {
    it("compares bytes by their bytes, and never takes numbers for bytes", () => {
        expect(alike(Uint8Array.of(1, 2), Uint8Array.of(1, 2))).toBe(true)
        expect(alike(Uint8Array.of(1, 2), Uint8Array.of(1, 3))).toBe(false)
        expect(alike([1, 2], Uint8Array.of(1, 2))).toBe(false)
    })

    it("compares arrays and plain objects entry by entry, the rest by identity", () => {
        expect(alike({ a: [1, { b: Uint8Array.of(7) }], c: null }, { a: [1, { b: Uint8Array.of(7) }], c: null })).toBe(true)
        expect(alike({ a: 1, extra: 2 }, { a: 1 })).toBe(false)
        expect(alike({ a: 1 }, { a: 1, missing: 2 })).toBe(false)
        expect(alike([1, 2], [1, 2, 3])).toBe(false)
        expect(alike("x", "x")).toBe(true)
        expect(alike(null, {})).toBe(false)
        expect(alike(Number.NaN, Number.NaN)).toBe(true)
    })
})
