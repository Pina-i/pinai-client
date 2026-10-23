import { useQueryClient } from "@tanstack/react-query"
import { useLocation } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { revokeDeviceUseCase } from "@pinai/domain/usecases/e2ee/revoke-device.usecase"
import { getDeviceDirectoryPort, getE2eePort, getSessionPort } from "@/ioc"
import { devicesQueryKey, useDevices, type DeviceRow } from "@/presentation/hooks/useDevices"
import { type RecentSignIn, useRecentSignIn } from "@/presentation/hooks/use-recent-sign-in"
import { useAppStore } from "@/store/store"

import { settingsHref } from "../SettingsModal.viewmodel"

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

    isSigningOutOthers: boolean
    onSignOutOthers: () => Promise<void>

    /** Revoking, signing the others out and clearing the backup take a recent password. */
    recentSignIn: RecentSignIn
}

/**
 * Orchestrates the Settings → Devices pane.
 *
 *  - device list via `useDevices` (TanStack Query)
 *  - local passphrase via `IE2eePort.loadStoredPassphrase`
 *  - per-device revoke = `revokeDeviceUseCase` (server flag, then MLS
 *    Remove commits), then invalidate the devices query so the list
 *    re-renders
 *  - "Clear recovery key" = `IE2eePort.clearRecoveryKey` (server blob
 *    DELETE + local wipe), then clears local passphrase state
 *  - a refusal for a password typed too long ago asks for it again, and
 *    comes back to this pane
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
    const location = useLocation()
    const recentSignIn = useRecentSignIn(useCallback(() => settingsHref(location, "devices"), [location]))
    const { refused } = recentSignIn

    const { rows, isLoading, error } = useDevices()

    const [passphraseWords, setPassphraseWords] = useState<string[] | null>(null)
    const [isPassphraseLoading, setIsPassphraseLoading] = useState(true)
    const [isClearingRecovery, setIsClearingRecovery] = useState(false)
    const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null)
    const [isSigningOutOthers, setIsSigningOutOthers] = useState(false)

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
            if (refused(e, "clear the history backup")) return
            toast.error(e instanceof Error ? e.message : "Could not clear history backup")
        } finally {
            setIsClearingRecovery(false)
        }
    }, [idpUrl, accessToken, refused])

    const onRevokeDevice = useCallback(
        async (deviceId: string) => {
            if (!idpUrl || !accessToken || !ownActorUri) return
            setRevokingDeviceId(deviceId)
            try {
                await revokeDeviceUseCase({ e2eePort: getE2eePort(), deviceDirectoryPort: getDeviceDirectoryPort() })({
                    idpUrl,
                    accessToken,
                    actorUri: ownActorUri,
                    deviceId,
                    conversationIds: localDmConvos.map((c) => c.id),
                })
                await queryClient.invalidateQueries({ queryKey: devicesQueryKey(idpUrl) })
                toast.success("Device revoked")
            } catch (e) {
                if (refused(e, "revoke a device")) return
                toast.error(e instanceof Error ? e.message : "Revoke failed")
            } finally {
                setRevokingDeviceId(null)
            }
        },
        [idpUrl, accessToken, ownActorUri, localDmConvos, queryClient, refused],
    )

    // Their devices stay: each may sign in again, as the same device.
    const onSignOutOthers = useCallback(async () => {
        if (!idpUrl || !accessToken) return
        setIsSigningOutOthers(true)
        try {
            await getSessionPort().signOutOtherDevices(idpUrl, accessToken)
            await queryClient.invalidateQueries({ queryKey: devicesQueryKey(idpUrl) })
            toast.success("Signed out of your other devices")
        } catch (e) {
            if (refused(e, "sign out your other devices")) return
            toast.error(e instanceof Error ? e.message : "Could not sign out the other devices")
        } finally {
            setIsSigningOutOthers(false)
        }
    }, [idpUrl, accessToken, queryClient, refused])

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
        isSigningOutOthers,
        onSignOutOthers,
        recentSignIn,
    }
}
