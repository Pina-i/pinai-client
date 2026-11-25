import { activityLabel } from "@pinai/domain/models/device"
import { devicesPane, ONLY_APPROVED_REVOKES, refusedDevice, wordsOffers, type HeldWords, type RosterDevice } from "@pinai/domain/models/device-roster"
import type { DeviceId } from "@pinai/domain/models/e2ee"
import { isApprovalRequired, isUnreachable } from "@pinai/domain/models/idp-error"
import { seatState, type SeatKind } from "@pinai/domain/models/waiting-seat"
import { router } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { getE2eePort } from "@/ioc"
import { dayLabel } from "@/presentation/_libs/day-label"
import { useHistoryReset } from "@/presentation/_libs/history-reset"
import { signOutDevice } from "@/presentation/_libs/sign-out-device"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useClock } from "@/presentation/hooks/use-clock"
import { useDeviceRoster } from "@/presentation/hooks/use-device-roster"
import { useRecentSignIn } from "@/presentation/hooks/use-recent-sign-in"
import { useAppStore } from "@/store/store"

/** Settings › Devices: the rules are the domain's (`devicesPane`, `wordsOffers`, `seatState`), the answering the Door's. */
export function useDevicesViewModel() {
    const roster = useDeviceRoster()
    const { rows, events, verdict, answering, waiting, fromBefore, reload } = roster
    const { reset } = useHistoryReset()
    const recentSignIn = useRecentSignIn(() => "/devices")
    const { refused } = recentSignIn
    const now = useClock(true)

    // While the screen is up, requests wait in their seats; once it goes, an exchange under way goes on at the Door.
    useEffect(() => {
        answering?.showSeats()
        return () => answering?.leaveSeat()
    }, [answering])

    // Each review may find this device settled since: it then takes a code.
    useEffect(() => {
        answering?.refresh().catch((error: unknown) => warnE2ee("reading the approval requests", error))
    }, [answering, verdict])

    // What the instance refuses is its own count, this device's included: never this device's trust.
    const [approvedByInstance, setApprovedByInstance] = useState<ReadonlySet<DeviceId> | null>(null)
    useEffect(() => {
        const { idpUrl, accessToken, user } = useAppStore.getState()
        if (!rows || !idpUrl || !accessToken || !user) return
        let live = true
        getE2eePort()
            .approvedAsTheInstanceCounts(idpUrl, accessToken, user.actor_uri, rows)
            // A changed list is counted again: meanwhile the last count stands, as `null` would withhold nothing.
            .then((counted) => live && setApprovedByInstance(counted && new Set(counted)))
            .catch((error: unknown) => warnE2ee("counting the approved devices", error))
        return () => {
            live = false
        }
    }, [rows])

    // Read again with each review and each list: a share kept or a new generation changes both.
    const [held, setHeld] = useState<HeldWords | null>(null)
    useEffect(() => {
        let live = true
        const port = getE2eePort()
        const words = port.loadStoredPassphrase().catch((error: unknown) => {
            warnE2ee("reading the history passphrase", error)
            return null
        })
        Promise.all([port.historyKeyStanding(), words, port.pendingHistoryKey()])
            .then(([standing, kept, pending]) => live && setHeld({ standing, words: kept, pending }))
            .catch((error: unknown) => warnE2ee("reading the history key's standing", error))
        return () => {
            live = false
        }
    }, [verdict, rows])

    const pane = devicesPane({ rows: rows ?? [], events, verdict, waiting, fromBefore, approvedByInstance })
    const offers = wordsOffers(held, reset !== null)
    const thisDevice = pane.listed.find((r) => r.device.device_id === pane.thisDevice) ?? null
    const others = pane.listed.filter((r) => r.device.device_id !== pane.thisDevice)

    const [signingOut, setSigningOut] = useState<DeviceId | null>(null)
    const [error, setError] = useState<string | null>(null)
    const signOut = useCallback(
        (device: RosterDevice): Promise<boolean> => {
            setSigningOut(device.device_id)
            setError(null)
            return signOutDevice(device.device_id)
                .then(() => {
                    reload()
                    return true
                })
                .catch((e: unknown) => {
                    if (refused(e, "sign that device out")) return false
                    warnE2ee("signing the device out", e)
                    setError(isApprovalRequired(e) ? `${ONLY_APPROVED_REVOKES}.` : isUnreachable(e) ? "Couldn't reach your instance. Try again." : "Couldn't sign it out. Try again.")
                    if (isApprovalRequired(e)) reload()
                    return false
                })
                .finally(() => setSigningOut(null))
        },
        [refused, reload]
    )

    const [seat, setSeat] = useState<{ deviceId: DeviceId; kind: "waiting" | "from-before" } | null>(null)
    const [details, setDetails] = useState<DeviceId | null>(null)
    const seatDevice = seat ? (rows?.find((d) => d.device_id === seat.deviceId) ?? null) : null
    const detailsRow = details ? (pane.listed.find((r) => r.device.device_id === details) ?? null) : null

    return {
        loading: rows === null && !roster.failed,
        failed: rows === null && roster.failed,
        reload,
        listRefused: pane.listRefused,
        waiting,
        fromBefore,
        fromBeforeHeading: pane.fromBeforeHeading,
        isRefused: (device: RosterDevice) => refusedDevice(verdict, device),
        thisDevice,
        others,
        heldBy: pane.heldBy,
        passphraseHeld: offers.passphraseWords !== null,
        offersRestore: offers.offersRestore === true,
        activity: (device: RosterDevice) => activityLabel(device, new Date(now), dayLabel),
        /** A seat's line: since when it asks (and that a tap answers it), else since when it is there. */
        seatLine: (device: RosterDevice, kind: SeatKind) => {
            const state = seatState({ device, seats: roster.seats, kind, now: new Date(now), day: dayLabel })
            return state.takesCode ? `${state.since} · tap to approve` : (state.since ?? "")
        },
        answering,
        seats: roster.seats,
        signingOut,
        error,
        signOut,
        seat: seat && seatDevice ? { device: seatDevice, kind: seat.kind } : null,
        openSeat: (device: RosterDevice, kind: "waiting" | "from-before") => setSeat({ deviceId: device.device_id, kind }),
        closeSeat: () => setSeat(null),
        details: detailsRow,
        openDetails: (device: RosterDevice) => setDetails(device.device_id),
        closeDetails: () => setDetails(null),
        openWords: () => router.push("/words"),
        openRestore: () => router.push("/restore-words"),
        recentSignIn,
    }
}

export type DevicesViewModel = ReturnType<typeof useDevicesViewModel>
