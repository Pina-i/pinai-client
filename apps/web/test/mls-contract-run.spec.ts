import { describe, expect, it } from "vitest"

import type { ContractEngine } from "@pinai/mls/contract/devices"
import { runScenarios, summaryLine } from "@pinai/mls/contract/run"
import type { Scenario } from "@pinai/mls/contract/scenarios"

const make = async () => ({}) as ContractEngine

describe("the contract's runner", () => {
    it("plays every scenario in order, timed, a failure stopping none", async () => {
        let clock = 0
        const scenarios: Scenario[] = [
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

    it("words the line a run ends with", () => {
        const results = [
            { name: "a", error: null, ms: 400.4 },
            { name: "b", error: "Contract: x", ms: 440 },
        ]

        expect(summaryLine(results)).toBe("[mls-check] 1/2 passed in 840 ms")
    })
})
