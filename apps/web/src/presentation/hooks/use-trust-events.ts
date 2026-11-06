import { useEffect, useState, useSyncExternalStore } from "react"

import type { DeviceTrustVerdict, TrustEvent } from "@pinai/domain/models/device-trust"
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

/** The last review's verdict (`IE2eePort.verdictSnapshot`), as it changes. */
export function useDeviceVerdict(): DeviceTrustVerdict | null {
    return useSyncExternalStore(subscribeVerdict, readVerdict)
}

const subscribeVerdict = (listener: () => void) => getE2eePort().onVerdict(listener)
const readVerdict = () => getE2eePort().verdictSnapshot()
