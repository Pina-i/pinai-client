import { useEffect } from "react"
import { toast } from "sonner"

import { arrivalToTell, trustEventKey } from "@pinai/domain/models/device-trust"
import { getE2eePort } from "@/ioc"
import { summonDoor, unsummonDoor } from "@/presentation/hooks/use-approval-answering"

// Once a page load per device: a remount hears the standing events again. A reload doesn't: it is no longer `arrived`.
const told = new Set<string>()

/**
 * A device found unapproved the first time (`arrived`), told wherever the app is; "Review" calls the Door for it.
 * Gone once it no longer stands, the Door waiting for it no more. Only an acting device announces one.
 */
export function useUnapprovedDeviceNotice(): void {
    useEffect(() => {
        const port = getE2eePort()
        const stopTold = port.onTrustEvent((event) => {
            const arrival = arrivalToTell(event, told)
            if (!arrival) return
            told.add(arrival.key)
            toast(`New device not approved: ${arrival.displayName || "a device"}. Not you? Sign it out.`, {
                id: arrival.key,
                duration: 15_000,
                action: {
                    label: "Review",
                    onClick: () => summonDoor({ deviceId: arrival.deviceId, displayName: arrival.displayName }),
                },
            })
        })
        const stopWithdrawn = port.onTrustWithdrawn((event) => {
            if (event.kind !== "unapproved-device") return
            toast.dismiss(trustEventKey(event))
            unsummonDoor(event.deviceId)
        })
        return () => {
            stopTold()
            stopWithdrawn()
        }
    }, [])
}
