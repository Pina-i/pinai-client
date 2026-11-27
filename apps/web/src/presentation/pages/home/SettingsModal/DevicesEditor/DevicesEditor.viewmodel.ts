import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocation } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import type { SeatsView } from "@pinai/domain/models/approval-handshake"
import { deviceListKey, renameRefusal } from "@pinai/domain/models/device"
import {
    devicesPane,
    type HeldWords,
    ONLY_APPROVED_CLEARS,
    ONLY_APPROVED_RENAMES,
    ONLY_APPROVED_REVOKES,
    ONLY_APPROVED_SIGNS_OUT,
    refusedDevice,
    wordsOffers,
    type PaneRow,
} from "@pinai/domain/models/device-roster"
import { isApprovalRequired } from "@pinai/domain/models/idp-error"
import type { ApprovalAnswering } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { clearHistoryBackupUseCase } from "@pinai/domain/usecases/e2ee/clear-history-backup.usecase"
import { revokeDeviceUseCase } from "@pinai/domain/usecases/e2ee/revoke-device.usecase"
import { instanceHost } from "@pinai/domain/models/instance"
import { passwordAdvice } from "@pinai/domain/models/instance-admin"
import { getDeviceDirectoryPort, getE2eePort, getHistoryArchivePort, getSessionPort } from "@/ioc"
import { warnE2ee, warnOf } from "@/presentation/_libs/key-share-deps"
import { useDeviceRoster } from "@/presentation/hooks/use-device-roster"
import { usePasswordChange } from "@/presentation/hooks/use-password-change"
import { useHistoryReset } from "@/presentation/providers/HistoryResetProvider/HistoryReset.context"
import { devicesQueryKey, type DeviceRow } from "@/presentation/hooks/useDevices"
import { type RecentSignIn, useRecentSignIn } from "@/presentation/hooks/use-recent-sign-in"
import { useAppStore } from "@/store/store"

import { settingsHref } from "../SettingsModal.viewmodel"
import type { RenameOutcome } from "./DeviceCard/DeviceCard.viewmodel"
import { type ReplaceWordsViewModel, useReplaceWordsViewModel } from "./ReplaceWords/ReplaceWords.viewmodel"

/** A device of the list, as its row says it. */
export type DeviceRowView = PaneRow<DeviceRow>

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
    /** Why the card withholds "Clear history backup": the instance doesn't count this device approved. `null` when offered. */
    clearWithheld: string | null
    /** Only on a device holding the current words, no key of its own pending but a replacement's. */
    offersReplace: boolean
    replaceWords: ReplaceWordsViewModel

    revokingDeviceId: string | null
    onRevokeDevice: (deviceId: string) => Promise<void>
    /** `null` gives the automatic name back. */
    onRenameDevice: (deviceId: string, name: string | null) => Promise<RenameOutcome>

    isSigningOutOthers: boolean
    onSignOutOthers: () => Promise<void>
    /** Why the header withholds "Sign out other devices", for the same reason, and how to change the password instead. `null` when offered. */
    signOutOthersWithheld: string | null

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

    // While the pane is up, requests wait in their seats; once it goes, an exchange under way goes on at the Door.
    useEffect(() => {
        answering?.showSeats()
        return () => answering?.leaveSeat()
    }, [answering])

    // Each review may find this device settled since: it then takes a code.
    useEffect(() => {
        answering?.refresh().catch(warnOf("reading the approval requests"))
    }, [answering, verdict])

    const [held, setHeld] = useState<HeldWords | null>(null)
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

    // What the instance refuses is its own count, this device's included: never this device's trust.
    const approvedByInstance = useQuery({
        queryKey: ["devices-approved-as-listed", idpUrl, listKey],
        queryFn: async () => {
            const counted = await getE2eePort().approvedAsTheInstanceCounts(idpUrl!, useAppStore.getState().accessToken!, ownActorUri!, rows!)
            return counted && new Set(counted)
        },
        enabled: !!idpUrl && !!accessToken && !!ownActorUri && !!rows,
        // A list that changed (a rename) is counted again under a new key: meanwhile `null` would withhold nothing.
        placeholderData: keepPreviousData,
    }).data

    const pane = devicesPane({ rows: rows ?? [], events, verdict, waiting, fromBefore, approvedByInstance: approvedByInstance ?? null })
    // Under the banner, the way back is its "It was me", never the new-device page.
    const offers = wordsOffers(held, reset !== null)
    const uncounted = pane.uncounted
    // NodeInfo read only once there is a key: before one, the instance refuses none of these for approval.
    const howToChangePassword = usePasswordChange(!!approvedByInstance)
    const signOutRefused = `${ONLY_APPROVED_SIGNS_OUT} ${passwordAdvice(howToChangePassword, instanceHost(idpUrl), "this one included")}`

    // Refused anyway, the count changed meanwhile: the list read again too, as the count is computed from it.
    const recount = useCallback(() => {
        if (idpUrl) void queryClient.invalidateQueries({ queryKey: devicesQueryKey(idpUrl) })
        void queryClient.invalidateQueries({ queryKey: ["devices-approved-as-listed", idpUrl] })
    }, [idpUrl, queryClient])

    const refusedUnapproved = useCallback(
        (e: unknown, words: string): boolean => {
            if (!isApprovalRequired(e)) return false
            toast.error(words)
            recount()
            return true
        },
        [recount],
    )

    const onClearHistoryBackup = useCallback(async () => {
        if (!idpUrl || !accessToken) return
        setIsClearingHistoryBackup(true)
        try {
            await clearHistoryBackupUseCase({ historyArchivePort: getHistoryArchivePort() })(idpUrl, accessToken)
            toast.success("History backup cleared")
        } catch (e) {
            if (refused(e, "clear the history backup") || refusedUnapproved(e, `${ONLY_APPROVED_CLEARS}.`)) return
            toast.error(e instanceof Error ? e.message : "Could not clear history backup")
        } finally {
            setIsClearingHistoryBackup(false)
        }
    }, [idpUrl, accessToken, refused, refusedUnapproved])

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
                if (refused(e, "revoke a device") || refusedUnapproved(e, `${ONLY_APPROVED_REVOKES}.`)) return
                toast.error(e instanceof Error ? e.message : "Revoke failed")
            } finally {
                setRevokingDeviceId(null)
            }
        },
        [idpUrl, accessToken, ownActorUri, localDmConvos, queryClient, refused, refusedUnapproved, answering],
    )

    const onRenameDevice = useCallback(
        async (deviceId: string, name: string | null): Promise<RenameOutcome> => {
            if (!idpUrl || !accessToken) return "failed"
            try {
                await getDeviceDirectoryPort().renameDevice(idpUrl, accessToken, deviceId, name)
                // Waits for the list, so the field never closes on the old name.
                await queryClient.invalidateQueries({ queryKey: devicesQueryKey(idpUrl) })
                return "renamed"
            } catch (e) {
                if (refusedUnapproved(e, `${ONLY_APPROVED_RENAMES}.`)) return "withdrawn"
                const refusal = renameRefusal(e)
                if (refusal !== "gone") return refusal
                // Revoked elsewhere or not there any more: the list read again shows it.
                recount()
                return "withdrawn"
            }
        },
        [idpUrl, accessToken, queryClient, refusedUnapproved, recount],
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
            if (refused(e, "sign out your other devices") || refusedUnapproved(e, signOutRefused)) return
            toast.error(e instanceof Error ? e.message : "Could not sign out the other devices")
        } finally {
            setIsSigningOutOthers(false)
        }
    }, [idpUrl, accessToken, queryClient, refused, refusedUnapproved, signOutRefused])

    return {
        isLoading,
        error,
        waiting,
        fromBefore,
        fromBeforeHeading: pane.fromBeforeHeading,
        isRefused: (device) => refusedDevice(verdict, device),
        waitingAnnouncement: pane.waitingAnnouncement,
        rows: rows ? pane.listed : undefined,
        listRefused: pane.listRefused,
        answering,
        seats,
        passphraseWords: offers.passphraseWords,
        heldBy: rows ? pane.heldBy : null,
        offersRestore: offers.offersRestore,
        offersReplace: offers.offersReplace,
        replaceWords,
        isClearingHistoryBackup,
        onClearHistoryBackup,
        clearWithheld: uncounted ? ONLY_APPROVED_CLEARS : null,
        revokingDeviceId,
        onRevokeDevice,
        onRenameDevice,
        isSigningOutOthers,
        onSignOutOthers,
        signOutOthersWithheld: uncounted ? signOutRefused : null,
        recentSignIn,
    }
}
