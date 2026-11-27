/**
 * What the contracts share (`@pinai/mls/contract`, `@pinai/crypto/contract/storage`): plain TypeScript a
 * build plays where no test runner is — on a phone —, a scenario throwing when it fails.
 */

import { sameBytes } from "../models/bytes"

export interface ContractScenario<Make> {
    readonly name: string
    run(make: Make): Promise<void>
}

export interface ScenarioResult {
    readonly name: string
    /** `null` when it passed. */
    readonly error: string | null
    readonly ms: number
}

/** One after the other, each timed: a failure stops none of the others. */
export async function runScenarios<Make>(
    scenarios: readonly ContractScenario<Make>[],
    make: Make,
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

/** The line a run ends with, which the mobile app's check scripts wait for in the device's log. */
export function summaryLine(label: string, results: readonly ScenarioResult[]): string {
    const passed = results.filter((result) => result.error === null).length
    const ms = results.reduce((total, result) => total + result.ms, 0)
    return `[${label}] ${passed}/${results.length} passed in ${Math.round(ms)} ms`
}

export function check(condition: boolean, what: string): asserts condition {
    if (!condition) throw new Error(`Contract: ${what}`)
}

export function same(actual: Uint8Array, expected: Uint8Array, what: string): void {
    check(sameBytes(actual, expected), what)
}

/** `run` must reject. */
export async function refused(run: () => Promise<unknown>, what: string): Promise<void> {
    try {
        await run()
    } catch {
        return
    }
    throw new Error(`Contract: ${what} was taken`)
}

/** Bytes by their bytes, arrays and plain objects entry by entry, anything else by identity. */
export function alike(actual: unknown, expected: unknown): boolean {
    if (expected instanceof Uint8Array) return actual instanceof Uint8Array && sameBytes(actual, expected)
    if (Array.isArray(expected)) {
        return Array.isArray(actual) && actual.length === expected.length && expected.every((item, i) => alike(actual[i], item))
    }
    if (expected !== null && typeof expected === "object") {
        if (actual === null || typeof actual !== "object" || Array.isArray(actual) || actual instanceof Uint8Array) return false
        const keys = Object.keys(expected)
        return (
            keys.length === Object.keys(actual).length &&
            keys.every((key) => alike((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key]))
        )
    }
    return Object.is(actual, expected)
}

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

export const fromUtf8 = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

export const hex = (text: string): Uint8Array => Uint8Array.from(text.match(/../g) ?? [], (b) => parseInt(b, 16))
