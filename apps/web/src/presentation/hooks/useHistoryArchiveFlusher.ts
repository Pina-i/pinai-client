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
    const signedIn = useAppStore((s) => s.accessToken !== null)

    useEffect(() => {
        if (!idpUrl || !signedIn) return
        const port = getE2eePort()
        port.startFlushing(idpUrl, () => useAppStore.getState().accessToken)
        return () => {
            port.stopFlushing()
        }
    }, [idpUrl, signedIn])
}
