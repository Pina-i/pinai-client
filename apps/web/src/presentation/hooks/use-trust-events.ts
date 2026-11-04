import { useEffect, useState } from "react"

import type { TrustEvent } from "@pinai/domain/models/device-trust"
import { getE2eePort } from "@/ioc"

/** The trust events standing now (`IE2eePort.trustSnapshot`), kept as they come and as they are withdrawn. */
export function useTrustEvents(): TrustEvent[] {
    const [events, setEvents] = useState<TrustEvent[]>(() => getE2eePort().trustSnapshot())
    useEffect(() => {
        const port = getE2eePort()
        const read = () => setEvents(port.trustSnapshot())
        const stopTold = port.onTrustEvent(read)
        const stopWithdrawn = port.onTrustWithdrawn(read)
        read()
        return () => {
            stopTold()
            stopWithdrawn()
        }
    }, [])
    return events
}
