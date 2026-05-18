import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { revokeDeviceUseCase } from "@/domain/usecases/e2ee/revoke-device.usecase"
import { getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { devicesQueryKey, useDevices, type DeviceRow } from "@/presentation/hooks/useDevices"
import { useAppStore } from "@/store/store"

export interface DevicesEditorViewModel {
    rows: DeviceRow[] | undefined
    isLoading: boolean
    error: unknown

    passphraseWords: string[] | null
    isPassphraseLoading: boolean
    isClearingRecovery: boolean
    onClearRecovery: () => Promise<void>

    revokingDeviceId: string | null
    onRevokeDevice: (deviceId: string) => Promise<void>
}

/**
 * Orchestrates the Settings → Devices pane.
 *
 *  - device list via `useDevices` (TanStack Query)
 *  - local passphrase via `IE2eePort.loadStoredPassphrase`
 *  - per-device revoke = `revokeDeviceUseCase` (MLS Remove commits) +
 *    `IDeviceDirectoryPort.markRevoked` (server flag), then invalidate
 *    the devices query so the list re-renders
 *  - "Clear recovery key" = `IE2eePort.clearRecoveryKey` (server blob
 *    DELETE + local wipe), then clears local passphrase state
 *
 * Revoke + clear both run sequentially to avoid two concurrent MLS
 * commits racing each other against the same conversation epoch.
 */
export function useDevicesEditorViewModel(): DevicesEditorViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const accessToken = useAppStore((s) => s.accessToken)
    const ownActorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const queryClient = useQueryClient()

    const { rows, isLoading, error } = useDevices()

    const [passphraseWords, setPassphraseWords] = useState<string[] | null>(null)
    const [isPassphraseLoading, setIsPassphraseLoading] = useState(true)
    const [isClearingRecovery, setIsClearingRecovery] = useState(false)
    const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        void (async () => {
            try {
                const words = await getE2eePort().loadStoredPassphrase()
                if (!cancelled) setPassphraseWords(words)
            } catch {
                if (!cancelled) setPassphraseWords(null)
            } finally {
                if (!cancelled) setIsPassphraseLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [])

    const onClearRecovery = useCallback(async () => {
        if (!idpUrl || !accessToken) return
        setIsClearingRecovery(true)
        try {
            await getE2eePort().clearHistoryBackup(idpUrl, accessToken)
            setPassphraseWords(null)
            toast.success("History backup cleared")
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not clear history backup")
        } finally {
            setIsClearingRecovery(false)
        }
    }, [idpUrl, accessToken])

    const onRevokeDevice = useCallback(
        async (deviceId: string) => {
            if (!idpUrl || !accessToken || !ownActorUri) return
            setRevokingDeviceId(deviceId)
            try {
                // Step 1 — MLS Remove commits across every conversation
                // the device is in. The use case iterates and swallows
                // per-conversation failures, so a single broken group
                // won't block the directory mark below.
                const conversationIds = localDmConvos.map((c) => c.id)
                await revokeDeviceUseCase({ e2eePort: getE2eePort() })({
                    idpUrl,
                    accessToken,
                    actorUri: ownActorUri,
                    deviceId,
                    conversationIds,
                })
                // Step 2 — flip the server-side directory flag so the
                // row shows as "signed out" on every device's next list
                // refresh (and so this device's KeyPackages stop being
                // claimed for new conversations).
                await getDeviceDirectoryPort().markRevoked(idpUrl, accessToken, deviceId)
                await queryClient.invalidateQueries({ queryKey: devicesQueryKey(idpUrl) })
                toast.success("Device revoked")
            } catch (e) {
                toast.error(e instanceof Error ? e.message : "Revoke failed")
            } finally {
                setRevokingDeviceId(null)
            }
        },
        [idpUrl, accessToken, ownActorUri, localDmConvos, queryClient],
    )

    return {
        rows,
        isLoading,
        error,
        passphraseWords,
        isPassphraseLoading,
        isClearingRecovery,
        onClearRecovery,
        revokingDeviceId,
        onRevokeDevice,
    }
}
