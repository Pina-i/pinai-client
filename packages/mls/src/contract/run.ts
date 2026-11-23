/** Plays scenarios one after the other, each timed: a failure stops none of the others. */

import type { MakeEngine } from "./devices"
import type { Scenario } from "./scenarios"

export interface ScenarioResult {
    readonly name: string
    /** `null` when it passed. */
    readonly error: string | null
    readonly ms: number
}

export async function runScenarios(
    scenarios: readonly Scenario[],
    make: MakeEngine,
    onResult: (result: ScenarioResult) => void = () => {},
    now: () => number = () => Date.now()
): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = []
    for (const scenario of scenarios) {
        const start = now()
        let error: string | null = null
        try {
            await scenario.run(make)
        } catch (thrown) {
            error = thrown instanceof Error ? thrown.message : String(thrown)
        }
        const result = { name: scenario.name, error, ms: now() - start }
        results.push(result)
        onResult(result)
    }
    return results
}

/** The line a run ends with, which the mobile app's `scripts/mls-check.mjs` waits for in the device's log. */
export function summaryLine(results: readonly ScenarioResult[]): string {
    const passed = results.filter((result) => result.error === null).length
    const ms = results.reduce((total, result) => total + result.ms, 0)
    return `[mls-check] ${passed}/${results.length} passed in ${Math.round(ms)} ms`
}
