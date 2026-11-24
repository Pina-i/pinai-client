import { type ContractScenario, type ScenarioResult, runScenarios, summaryLine } from "@pinai/domain/lib/contract"
import { useEffect, useEffectEvent, useState } from "react"
import { Linking } from "react-native"

export interface ContractCheck {
    readonly results: ScenarioResult[]
    readonly running: boolean
    readonly passed: number
    readonly total: number
    runAgain(): void
}

/**
 * A contract played at once, again on "Run again" and on a link to the screen while it is open. `label` names the
 * lines logged for the device check scripts (`[label] ✗ …`, then `summaryLine`); `link` is the screen's path.
 */
export function useContractCheck<Make>(label: string, scenarios: readonly ContractScenario<Make>[], make: Make, link: string): ContractCheck {
    const [round, setRound] = useState(0)
    const [results, setResults] = useState<ScenarioResult[]>([])
    const [running, setRunning] = useState(true)

    useEffect(() => {
        let current = true
        void runScenarios(scenarios, make, (result) => {
            if (current) setResults((done) => [...done, result])
            const ms = Math.round(result.ms)
            // eslint-disable-next-line no-console -- read from the device's log by scripts/device-check.mjs
            console.log(result.error === null ? `[${label}] ✓ ${result.name} — ${ms} ms` : `[${label}] ✗ ${result.name}: ${result.error}`)
        }).then((all) => {
            // eslint-disable-next-line no-console -- the line scripts/device-check.mjs waits for
            console.log(summaryLine(label, all))
            if (current) setRunning(false)
        })
        return () => {
            current = false
        }
    }, [round, label, scenarios, make])

    function runAgain() {
        if (running) return
        setResults([])
        setRunning(true)
        setRound((n) => n + 1)
    }

    // The router takes a link to the screen already open as nothing new: the check script run again plays it again.
    const onLink = useEffectEvent((url: string) => {
        if (url.split("?")[0].endsWith(link)) runAgain()
    })
    useEffect(() => {
        const subscription = Linking.addEventListener("url", ({ url }) => onLink(url))
        return () => subscription.remove()
    }, [])

    const passed = results.filter((result) => result.error === null).length
    return { results, running, passed, total: scenarios.length, runAgain }
}
