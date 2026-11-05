import { useQueryClient } from "@tanstack/react-query"
import { useLocation } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import type { SeatsView } from "@pinai/domain/models/approval-handshake"
import { deviceListKey } from "@pinai/domain/models/device"
import {
    approvedByWording,
    approverOf,
    historyHolders,
    holdsCurrentWords,
    holdsHistory,
    refusedDevice,
} from "@pinai/domain/models/device-roster"
import type { HistoryKeyStanding, PendingHistoryKey } from "@pinai/domain/models/history-key"
import type { ApprovalAnswering } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { clearHistoryBackupUseCase } from "@pinai/domain/usecases/e2ee/clear-history-backup.usecase"
import { revokeDeviceUseCase } from "@pinai/domain/usecases/e2ee/revoke-device.usecase"
import { getDeviceDirectoryPort, getE2eePort, getHistoryArchivePort, getSessionPort } from "@/ioc"
import { warnE2ee, warnOf } from "@/presentation/_libs/key-share-deps"
import { useDeviceRoster } from "@/presentation/hooks/use-device-roster"
import { useHistoryReset } from "@/presentation/providers/HistoryResetProvider/HistoryReset.context"
import { devicesQueryKey, type DeviceRow } from "@/presentation/hooks/useDevices"
import { type RecentSignIn, useRecentSignIn } from "@/presentation/hooks/use-recent-sign-in"
import { useAppStore } from "@/store/store"

import { settingsHref } from "../SettingsModal.viewmodel"
import { type ReplaceWordsViewModel, useReplaceWordsViewModel } from "./ReplaceWords/ReplaceWords.viewmodel"

/** A device of the list, as its row says it. */
export interface DeviceRowView {
    device: DeviceRow
    holdsHistory: boolean
    /** "this device", another's label, "your 24 words"; `null` on a device that doesn't act. */
    approvedBy: string | null
}

export interface DevicesEditorViewModel {
    isLoading: boolean
    error: unknown
    /** Each unapproved device, newest first: none on a device that doesn't act. */
    waiting: DeviceRow[]
    /** Unapproved, listed as this device set its generation over others: seated apart, counted nowhere. */
    fromBefore: DeviceRow[]
    /** "From before you started over" or "…you replaced your words"; `null` with none. */
    fromBeforeHeading: string | null
    /** The device the user refused, among those waiting: "Reset your history — not yours", no code. */
    isRefused: (device: DeviceRow) => boolean
    /** What a screen reader hears as seats come and go. */
    waitingAnnouncement: string
    rows: DeviceRowView[] | undefined
    /** The instance sent a list naming a device twice: nothing new is trusted until it stops. */
    listRefused: boolean

    /** The answering side the Door shares with the waiting seats; `null` until the Door made it. */
    answering: ApprovalAnswering | null
    seats: SeatsView

    /** The words, on a device holding the current passphrase; `null` on any other. */
    passphraseWords: string[] | null
    /** Listed devices, unrevoked, at the current generation; `null` before the list is read. */
    heldBy: number | null
    /** Only on a device that doesn't hold the current passphrase: `null` while that is unknown. */
    offersRestore: boolean | null
    isClearingHistoryBackup: boolean
    onClearHistoryBackup: () => Promise<void>
    /** Only on a device holding the current words, no key of its own pending but a replacement's. */
    offersReplace: boolean
    replaceWords: ReplaceWordsViewModel

    revokingDeviceId: string | null
    onRevokeDevice: (deviceId: string) => Promise<void>

    isSigningOutOthers: boolean
    onSignOutOthers: () => Promise<void>

    /** Revoking, signing the others out, clearing the backup and replacing the words take a recent password. */
    recentSignIn: RecentSignIn
}

/** Settings → Devices; the rules are `models/device-roster.ts`, the answering the Door's. */
export function useDevicesEditorViewModel(): DevicesEditorViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const accessToken = useAppStore((s) => s.accessToken)
    const ownActorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const queryClient = useQueryClient()
    const location = useLocation()
    const recentSignIn = useRecentSignIn(useCallback(() => settingsHref(location, "devices"), [location]))
    const { refused } = recentSignIn

    const { rows, isLoading, error, events, verdict, answering, seats, waiting, fromBefore } = useDeviceRoster()
    const { reset } = useHistoryReset()
    const listRefused = events.some((e) => e.kind === "device-list-refused")

    // While the pane is up, requests wait in their seats; once it goes, an exchange under way goes on at the Door.
    useEffect(() => {
        answering?.showSeats()
        return () => answering?.leaveSeat()
    }, [answering])

    // Each review may find this device settled since: it then takes a code.
    useEffect(() => {
        answering?.refresh().catch(warnOf("reading the approval requests"))
    }, [answering, verdict])

    const [held, setHeld] = useState<{ standing: HistoryKeyStanding; words: string[] | null; pending: PendingHistoryKey | null } | null>(
        null,
    )
    const [heldRevision, setHeldRevision] = useState(0)
    const [isClearingHistoryBackup, setIsClearingHistoryBackup] = useState(false)
    const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null)
    const [isSigningOutOthers, setIsSigningOutOthers] = useState(false)

    // Read again with each review and each list: a share kept or a new generation changes both.
    const listKey = rows ? deviceListKey(rows) : null
    useEffect(() => {
        let cancelled = false
        const port = getE2eePort()
        const words = port.loadStoredPassphrase().catch((e: unknown) => {
            warnE2ee("reading the history passphrase", e)
            return null
        })
        void Promise.all([port.historyKeyStanding(), words, port.pendingHistoryKey()]).then(
            ([standing, kept, pending]) => {
                if (!cancelled) setHeld({ standing, words: kept, pending })
            },
            warnOf("reading the history key's standing"),
        )
        return () => {
            cancelled = true
        }
    }, [verdict, listKey, heldRevision])

    const onReplaceSettled = useCallback(() => {
        setHeldRevision((n) => n + 1)
        if (idpUrl) void queryClient.invalidateQueries({ queryKey: devicesQueryKey(idpUrl) })
    }, [idpUrl, queryClient])
    const replaceWords = useReplaceWordsViewModel(recentSignIn, onReplaceSettled)

    const holds = held ? holdsCurrentWords(held.standing) : null
    const thisDevice = rows?.find((d) => d.is_current)?.device_id ?? verdict?.thisDevice ?? null
    const seated = new Set([...waiting, ...fromBefore].map((d) => d.device_id))
    const listed = rows
        ?.filter((d) => !seated.has(d.device_id))
        .map((device) => ({
            device,
            holdsHistory: holdsHistory(device, verdict),
            approvedBy: approvedByWording(approverOf(verdict, device), rows, thisDevice),
        }))

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
                // The revoke closed its requests: without the socket's push, the seat would still offer one.
                answering?.refresh().catch(warnOf("reading the approval requests"))
                toast.success("Device revoked")
            } catch (e) {
                if (refused(e, "revoke a device")) return
                toast.error(e instanceof Error ? e.message : "Revoke failed")
            } finally {
                setRevokingDeviceId(null)
            }
        },
        [idpUrl, accessToken, ownActorUri, localDmConvos, queryClient, refused, answering],
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
        isLoading,
        error,
        waiting,
        fromBefore,
        fromBeforeHeading:
            fromBefore.length === 0 ? null : verdict?.before?.cause === "replacement" ? "From before you replaced your words" : "From before you started over",
        isRefused: (device) => refusedDevice(verdict, device),
        waitingAnnouncement:
            waiting.length === 0 ? "" : `${waiting.length} waiting for you: ${waiting.map((d) => d.display_name.trim() || "a device").join(", ")}`,
        rows: listed,
        listRefused,
        answering,
        seats,
        passphraseWords: holds && held?.words ? held.words : null,
        heldBy: rows ? historyHolders(rows, verdict) : null,
        // Under the banner, the way back is its "It was me", never the new-device page.
        offersRestore: holds === null ? null : !holds && !reset,
        // A replacement whose answer was lost is pressed again: its key is sent again, or kept.
        offersReplace: holds === true && !!held?.words && (!held.pending || held.pending.rearchive === true),
        replaceWords,
        isClearingHistoryBackup,
        onClearHistoryBackup,
        revokingDeviceId,
        onRevokeDevice,
        isSigningOutOthers,
        onSignOutOthers,
        recentSignIn,
    }
}
