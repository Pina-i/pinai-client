import { useEffect } from "react"

import { getE2eePort } from "@/ioc"
import { useAppStore } from "@/store/store"

/**
 * Lifecycle for the history-archive upload loop. The buffer + flush
 * timer live in the E2EE adapter; this hook just starts/stops them.
 * Mount once in the authenticated layout root.
 */
export function useHistoryArchiveFlusher(): void {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const accessToken = useAppStore((s) => s.accessToken)

    useEffect(() => {
        if (!idpUrl || !accessToken) return
        const port = getE2eePort()
        port.startFlushing(idpUrl, accessToken)
        return () => {
            port.stopFlushing()
        }
    }, [idpUrl, accessToken])
}
