import { useEffect } from "react"

import { getE2eePort } from "@/ioc"
import { useAppStore } from "@/store/store"

/**
 * Phase 7 — Layer B lifecycle hook. Starts the background history-archive
 * flusher on mount, stops it on unmount. The actual buffer + 2-second
 * setInterval live inside the E2EE adapter so the framework dependency
 * doesn't leak; this hook is pure lifecycle.
 *
 * Mount once in the authenticated layout root, alongside
 * `useConsumeMlsWelcomes`. When the user signs out, the layout unmounts
 * and the flusher stops cleanly.
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
