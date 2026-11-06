import { useRouter } from "@tanstack/react-router"
import { useEffect } from "react"
import { toast } from "sonner"

import { trustEventKey } from "@pinai/domain/models/device-trust"
import { getE2eePort } from "@/ioc"
import { settingsHref } from "@/presentation/pages/home/SettingsModal/SettingsModal.viewmodel"

// Once a page load per device: a remount hears the standing events again. A reload doesn't: it is no longer `arrived`.
const told = new Set<string>()

/**
 * A device found unapproved the first time (`arrived`), told wherever the app is, with the way to
 * Settings → Devices; gone once it no longer stands. Only an acting device announces one.
 */
export function useUnapprovedDeviceNotice(): void {
    const router = useRouter()
    useEffect(() => {
        const port = getE2eePort()
        const stopTold = port.onTrustEvent((event) => {
            if (event.kind !== "unapproved-device" || !event.arrived) return
            const key = trustEventKey(event)
            if (told.has(key)) return
            told.add(key)
            toast(`New device not approved: ${event.displayName || "a device"}. Not you? Sign it out.`, {
                id: key,
                duration: 15_000,
                action: {
                    label: "Open Devices",
                    onClick: () => void router.navigate({ href: settingsHref(router.state.location, "devices") }),
                },
            })
        })
        const stopWithdrawn = port.onTrustWithdrawn((event) => {
            if (event.kind === "unapproved-device") toast.dismiss(trustEventKey(event))
        })
        return () => {
            stopTold()
            stopWithdrawn()
        }
    }, [router])
}
