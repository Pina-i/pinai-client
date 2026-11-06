import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { askingState, START_OVER_REREAD_MS, type AskingState, type StartOverRead } from "@pinai/domain/models/start-over"
import { readStartOverUseCase } from "@pinai/domain/usecases/e2ee/start-over-request.usecase"
import { getE2eePort, getStartOverPort } from "@/ioc"
import { useAppStore } from "@/store/store"

/** Every read of the account's start over request: a push refetches them all. */
export const startOverQueryKey = (idpUrl: string) => ["start-over", idpUrl] as const

export const ownStartOverQueryKey = (idpUrl: string) => [...startOverQueryKey(idpUrl), "own"] as const

// A device clock far behind the instance's would put `readyAt` past what setTimeout takes (2³¹ − 1 ms).
const LONGEST_TIMER_MS = 2 ** 31 - 1

export interface OwnStartOver {
    /** `null` until the first read settles, or while this device's id isn't known. */
    state: AskingState | null
    /** The first read failed: the screen offers asking all the same. */
    failed: boolean
    /** The clock `state` was read on: the last read's, or the timer's at the date it matures. */
    now: number
    refetch: () => Promise<unknown>
}

/** Its date moves while the user's approved devices are used, and nothing is pushed then: it is read again. */
export function useOwnStartOver(enabled: boolean): OwnStartOver {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const [thisDevice, setThisDevice] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        void getE2eePort()
            .getDeviceId()
            .then((id) => {
                if (!cancelled) setThisDevice(id)
            })
            .catch(() => undefined)
        return () => {
            cancelled = true
        }
    }, [])

    const query = useQuery<StartOverRead>({
        queryKey: ownStartOverQueryKey(idpUrl ?? ""),
        queryFn: () => readStartOverUseCase({ startOverPort: getStartOverPort() })(idpUrl!, useAppStore.getState().accessToken!),
        enabled: enabled && !!idpUrl && signedIn,
        refetchInterval: START_OVER_REREAD_MS,
        refetchOnWindowFocus: true,
        retry: 1,
    })

    // The clock the state is read on: each read's, or the timer's at the date it matures.
    const [tick, setTick] = useState(0)
    const { refetch } = query
    const now = Math.max(query.dataUpdatedAt, tick)

    const state = query.data && thisDevice ? askingState(query.data, thisDevice, now) : null
    const maturesAt = state?.kind === "waiting" ? state.request.readyAt : null
    useEffect(() => {
        if (maturesAt === null) return
        const timer = setTimeout(
            () => {
                setTick(Date.now())
                void refetch()
            },
            Math.min(Math.max(0, maturesAt - Date.now()) + 1_000, LONGEST_TIMER_MS),
        )
        return () => clearTimeout(timer)
    }, [maturesAt, refetch])

    return { state, failed: query.isError && query.data === undefined, now, refetch }
}
