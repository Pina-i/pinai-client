import { arrivalToTell } from "@pinai/domain/models/device-trust"
import { getE2eePort } from "@/ioc"
import { summonDoor, unsummonDoor } from "./approval-answering"

// Once an app run per device: a restart hears the standing events again, no longer `arrived`.
const told = new Set<string>()

/**
 * A device found unapproved the first time opens "Is this you?" for it, wherever the app is (the web shows a toast
 * instead); gone once it no longer stands. Only an acting device announces one.
 */
export function watchArrivals(): () => void {
    const port = getE2eePort()
    const stopTold = port.onTrustEvent((event) => {
        const arrival = arrivalToTell(event, told)
        if (!arrival) return
        told.add(arrival.key)
        summonDoor({ deviceId: arrival.deviceId, displayName: arrival.displayName })
    })
    const stopWithdrawn = port.onTrustWithdrawn((event) => {
        if (event.kind === "unapproved-device") unsummonDoor(event.deviceId)
    })
    return () => {
        stopTold()
        stopWithdrawn()
    }
}
