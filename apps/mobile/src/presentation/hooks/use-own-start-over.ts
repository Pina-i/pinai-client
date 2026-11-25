import { type AskingState, askingState, matureRereadDelay, START_OVER_REREAD_MS, type StartOverRead } from "@pinai/domain/models/start-over"
import { readStartOverUseCase } from "@pinai/domain/usecases/e2ee/start-over-request.usecase"
import { useCallback, useEffect, useRef, useState } from "react"
import { getE2eePort, getStartOverPort } from "@/ioc"
import { appVisibility } from "@/presentation/_libs/app-visibility"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useAppStore } from "@/store/store"

export interface OwnStartOver {
    /** `null` until the first read settles, or while this device's id isn't known. */
    state: AskingState | null
    /** The first read failed: the screen offers asking all the same. */
    failed: boolean
    /** The clock `state` was read on: the last read's, or the timer's at the date it matures. */
    now: number
    reread: () => Promise<void>
    /** What the flow learnt without a read: its own ask, or a finish refused as too early. */
    setRead: (update: (read: StartOverRead | null) => StartOverRead | null) => void
}

/**
 * This device's start over request. Its date moves while the user's approved devices are used, and nothing is pushed
 * to these screens: read as it opens, every `START_OVER_REREAD_MS` and when the app comes back to the front, and at
 * the date it matures.
 */
export function useOwnStartOver(enabled: boolean): OwnStartOver {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const [thisDevice, setThisDevice] = useState<string | null>(null)
    const [read, setRead] = useState<{ value: StartOverRead | null; at: number; failed: boolean }>({ value: null, at: 0, failed: false })
    const [tick, setTick] = useState(0)
    const live = useRef(true)

    useEffect(() => {
        live.current = true
        void getE2eePort()
            .getDeviceId()
            .then((id) => {
                if (live.current) setThisDevice(id)
            })
            .catch((error: unknown) => warnE2ee("reading this device's id", error))
        return () => {
            live.current = false
        }
    }, [])

    const reread = useCallback(async () => {
        const accessToken = useAppStore.getState().accessToken
        if (!idpUrl || !accessToken) return
        try {
            const value = await readStartOverUseCase({ startOverPort: getStartOverPort() })(idpUrl, accessToken)
            if (live.current) setRead({ value, at: Date.now(), failed: false })
        } catch (error) {
            warnE2ee("reading the start over request", error)
            if (live.current) setRead((known) => ({ ...known, failed: known.value === null }))
        }
    }, [idpUrl])

    useEffect(() => {
        if (!enabled || !signedIn) return
        const first = setTimeout(() => void reread(), 0)
        const timer = setInterval(() => {
            if (appVisibility.visible()) void reread()
        }, START_OVER_REREAD_MS)
        const stopWatching = appVisibility.onChange(() => {
            if (appVisibility.visible()) void reread()
        })
        return () => {
            clearTimeout(first)
            clearInterval(timer)
            stopWatching()
        }
    }, [enabled, signedIn, reread])

    const now = Math.max(read.at, tick)
    const state = read.value && thisDevice ? askingState(read.value, thisDevice, now) : null
    const maturesAt = state?.kind === "waiting" ? state.request.readyAt : null
    useEffect(() => {
        if (maturesAt === null) return
        const timer = setTimeout(
            () => {
                setTick(Date.now())
                void reread()
            },
            matureRereadDelay(maturesAt, Date.now())
        )
        return () => clearTimeout(timer)
    }, [maturesAt, reread])

    return {
        state,
        failed: read.failed,
        now,
        reread,
        setRead: useCallback((update) => setRead((known) => ({ value: update(known.value), at: Date.now(), failed: false })), []),
    }
}
