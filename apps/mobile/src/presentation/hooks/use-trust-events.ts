import type { DeviceTrustVerdict, TrustEvent } from "@pinai/domain/models/device-trust"
import { useEffect, useState } from "react"
import { getE2eePort } from "@/ioc"

/** The trust events standing now (`IE2eePort.trustSnapshot`), kept as they come and as they are withdrawn. */
export function useTrustEvents(): TrustEvent[] {
    const [events, setEvents] = useState<TrustEvent[]>(() => getE2eePort().trustSnapshot())
    useEffect(() => {
        const port = getE2eePort()
        const read = () => setEvents(port.trustSnapshot())
        const stopTold = port.onTrustEvent(read)
        const stopWithdrawn = port.onTrustWithdrawn(read)
        return () => {
            stopTold()
            stopWithdrawn()
        }
    }, [])
    return events
}

/** The last review's verdict, as it acts now. */
export function useDeviceVerdict(): DeviceTrustVerdict | null {
    const [verdict, setVerdict] = useState<DeviceTrustVerdict | null>(() => getE2eePort().verdictSnapshot())
    useEffect(() => {
        const port = getE2eePort()
        return port.onVerdict(() => setVerdict(port.verdictSnapshot()))
    }, [])
    return verdict
}
