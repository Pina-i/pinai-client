import { useQueryClient } from "@tanstack/react-query"
import { useLocation } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { unapprovedListed } from "@pinai/domain/models/device-trust"
import { clearHistoryBackupUseCase } from "@pinai/domain/usecases/e2ee/clear-history-backup.usecase"
import { revokeDeviceUseCase } from "@pinai/domain/usecases/e2ee/revoke-device.usecase"
import { getDeviceDirectoryPort, getE2eePort, getHistoryArchivePort, getSessionPort } from "@/ioc"
import { devicesQueryKey, useDevices, type DeviceRow } from "@/presentation/hooks/useDevices"
import { type RecentSignIn, useRecentSignIn } from "@/presentation/hooks/use-recent-sign-in"
import { useTrustEvents } from "@/presentation/hooks/use-trust-events"
import { useAppStore } from "@/store/store"

import { settingsHref } from "../SettingsModal.viewmodel"

export interface DevicesEditorViewModel {
    rows: DeviceRow[] | undefined
    isLoading: boolean
    error: unknown
    /** Rows this device, acting on approval, found unapproved: "Not mine" revokes them. */
    unapproved: ReadonlySet<string>
    /** The instance sent a list naming a device twice: nothing new is trusted until it stops. */
    listRefused: boolean

    passphraseWords: string[] | null
    isPassphraseLoading: boolean
    isClearingHistoryBackup: boolean
    onClearHistoryBackup: () => Promise<void>

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
 *  - "Clear history backup" = `clearHistoryBackupUseCase`: the saved entries
 *    only — the passphrase and its generation stay, saving goes on
 *  - a refusal for a password typed too long ago asks for it again, and
 *    comes back to this pane
 *  - the trust events standing: the devices an acting review left unapproved
 *    (only an acting device announces any), and a device list refused
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
    const events = useTrustEvents()
    const unapproved = useMemo(() => unapprovedListed(events, rows ?? []), [events, rows])
    const listRefused = events.some((e) => e.kind === "device-list-refused")

    const [passphraseWords, setPassphraseWords] = useState<string[] | null>(null)
    const [isPassphraseLoading, setIsPassphraseLoading] = useState(true)
    const [isClearingHistoryBackup, setIsClearingHistoryBackup] = useState(false)
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

    const onClearHistoryBackup = useCallback(async () => {
        if (!idpUrl || !accessToken) return
        setIsClearingHistoryBackup(true)
        try {
            await clearHistoryBackupUseCase({ historyArchivePort: getHistoryArchivePort() })(idpUrl, accessToken)
            toast.success("History backup cleared")
        } catch (e) {
            if (refused(e, "clear the history backup")) return
            toast.error(e instanceof Error ? e.message : "Could not clear history backup")
        } finally {
            setIsClearingHistoryBackup(false)
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
        unapproved,
        listRefused,
        passphraseWords,
        isPassphraseLoading,
        isClearingHistoryBackup,
        onClearHistoryBackup,
        revokingDeviceId,
        onRevokeDevice,
        isSigningOutOthers,
        onSignOutOthers,
        recentSignIn,
    }
}
