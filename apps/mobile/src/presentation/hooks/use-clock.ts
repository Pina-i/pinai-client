import { useEffect, useState } from "react"

/** The time, read again every 30 s while `running`: lines saying "2 minutes ago" stay true. */
export function useClock(running: boolean): number {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        if (!running) return
        const read = setTimeout(() => setNow(Date.now()), 0)
        const timer = setInterval(() => setNow(Date.now()), 30_000)
        return () => {
            clearTimeout(read)
            clearInterval(timer)
        }
    }, [running])
    return now
}
