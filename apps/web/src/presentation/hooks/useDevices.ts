import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import type { DeviceKind, DeviceListEntry } from "@pinai/domain/models/device"
import { getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { useAppStore } from "@/store/store"

export interface DeviceRow extends DeviceListEntry {
    /** Local-only — derived by comparing `device_id` to this device's UUID. */
    is_current: boolean
}

export const devicesQueryKey = (idpUrl: string) => ["devices", idpUrl] as const

/**
 * Fetch the user's devices via TanStack Query. Pure data — revoke /
 * recovery-clear orchestration lives in `DevicesEditor.viewmodel`.
 *
 * The local device id (used to compute `is_current`) is resolved once
 * per session through `IE2eePort.getDeviceId`; the rows are augmented
 * client-side because the server doesn't know which caller it's
 * answering.
 */
export function useDevices(): {
    rows: DeviceRow[] | undefined
    isLoading: boolean
    error: unknown
    refetch: () => void
} {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const accessToken = useAppStore((s) => s.accessToken)

    const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null)
    useEffect(() => {
        let cancelled = false
        void getE2eePort()
            .getDeviceId()
            .then((id) => {
                if (!cancelled) setCurrentDeviceId(id)
            })
            .catch(() => {
                // Best-effort — without the local id we just render no
                // "this device" chip, the rest of the view still works.
            })
        return () => {
            cancelled = true
        }
    }, [])

    const query = useQuery({
        queryKey: devicesQueryKey(idpUrl ?? ""),
        queryFn: async () => {
            const port = getDeviceDirectoryPort()
            const response = await port.listDevices(idpUrl!, accessToken!)
            return response.devices
        },
        enabled: !!idpUrl && !!accessToken,
    })

    const rows = query.data?.map((d) => ({
        ...d,
        kind: (["laptop", "phone", "tablet"].includes(d.kind) ? d.kind : "unknown") as DeviceKind,
        is_current: currentDeviceId !== null && d.device_id === currentDeviceId,
    }))

    return {
        rows,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    }
}
