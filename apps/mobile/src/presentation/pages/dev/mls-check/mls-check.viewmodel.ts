import type { ContractEngine } from "@pinai/mls/contract/devices"
import { type ScenarioResult, runScenarios, summaryLine } from "@pinai/domain/lib/contract"
import { SCENARIOS } from "@pinai/mls/contract/scenarios"
import { useEffect, useEffectEvent, useState } from "react"
import { Linking } from "react-native"
import { createMlsEngine } from "@/ioc"

async function make(): Promise<ContractEngine> {
    const engine = createMlsEngine()
    await engine.initialize()
    return engine
}

/** The contract on the native build: played at once, and again on demand. */
export function useMlsCheckViewModel() {
    const [round, setRound] = useState(0)
    const [results, setResults] = useState<ScenarioResult[]>([])
    const [running, setRunning] = useState(true)

    useEffect(() => {
        let current = true
        void runScenarios(SCENARIOS, make, (result) => {
            if (current) setResults((done) => [...done, result])
            // eslint-disable-next-line no-console -- read from the device's log by scripts/mls-check.mjs
            if (result.error !== null) console.log(`[mls-check] ✗ ${result.name}: ${result.error}`)
        }).then((all) => {
            // eslint-disable-next-line no-console -- the line scripts/mls-check.mjs waits for
            console.log(summaryLine("mls-check", all))
            if (current) setRunning(false)
        })
        return () => {
            current = false
        }
    }, [round])

    function runAgain() {
        if (running) return
        setResults([])
        setRunning(true)
        setRound((n) => n + 1)
    }

    // The router takes a link to the screen already open as nothing new: `mls:check` run again plays it again.
    const onLink = useEffectEvent((url: string) => {
        if (url.includes("dev/mls-check")) runAgain()
    })
    useEffect(() => {
        const subscription = Linking.addEventListener("url", ({ url }) => onLink(url))
        return () => subscription.remove()
    }, [])

    const passed = results.filter((result) => result.error === null).length
    return { results, running, passed, total: SCENARIOS.length, runAgain }
}
