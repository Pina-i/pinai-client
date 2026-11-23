import { useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { readRestartState, writeRestartState } from "./restart-state"

/** `?phase=write`, then — the app killed and started again — `?phase=read`: once per screen, logged for `storage:check`. */
export function useStorageRestartViewModel() {
    const { phase } = useLocalSearchParams<{ phase?: string }>()
    const [outcome, setOutcome] = useState<string | null>(null)

    useEffect(() => {
        if (phase !== "write" && phase !== "read") return
        let current = true
        const run = phase === "write" ? writeRestartState : readRestartState
        void run()
            .then(
                () => (phase === "write" ? "written" : "all back"),
                (error: unknown) => `✗ ${error instanceof Error ? error.message : String(error)}`
            )
            .then((said) => {
                // eslint-disable-next-line no-console -- the line scripts/storage-check.mjs waits for
                console.log(`[storage-check] restart: ${said}`)
                if (current) setOutcome(said)
            })
        return () => {
            current = false
        }
    }, [phase])

    return { phase: phase ?? null, outcome }
}
