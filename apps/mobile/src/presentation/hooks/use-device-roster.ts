import type { SeatsView } from "@pinai/domain/models/approval-handshake"
import { deviceListKey } from "@pinai/domain/models/device"
import { fromBeforeDevices, rosterRows, waitingDevices, type RosterDevice } from "@pinai/domain/models/device-roster"
import type { DeviceTrustVerdict, TrustEvent } from "@pinai/domain/models/device-trust"
import type { ApprovalAnswering } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { useCallback, useEffect, useState } from "react"
import { getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { useAnswering, useSeats } from "@/presentation/_libs/approval-answering"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useDeviceVerdict, useTrustEvents } from "@/presentation/hooks/use-trust-events"
import { useAppStore } from "@/store/store"

export interface DeviceRoster {
    /** `null` until the list was read. */
    rows: RosterDevice[] | null
    failed: boolean
    reload: () => void
    events: TrustEvent[]
    verdict: DeviceTrustVerdict | null
    answering: ApprovalAnswering | null
    seats: SeatsView
    /** Who waits for the user (`waitingDevices`): the seats, and the count on Settings' Devices row. */
    waiting: RosterDevice[]
    /** "From before you started over" (`fromBeforeDevices`): seated apart, counted nowhere. */
    fromBefore: RosterDevice[]
}

/** The account's devices as this device judges them, read again with each review, with the answering side the Door shares. */
export function useDeviceRoster(): DeviceRoster {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const events = useTrustEvents()
    const verdict = useDeviceVerdict()
    const answering = useAnswering()
    const seats = useSeats(answering)
    const [rows, setRows] = useState<RosterDevice[] | null>(null)
    const [failed, setFailed] = useState(false)
    const [reads, setReads] = useState(0)

    useEffect(() => {
        const { idpUrl, accessToken } = useAppStore.getState()
        if (!signedIn || !idpUrl || !accessToken) return
        let live = true
        const port = getE2eePort()
        Promise.all([getDeviceDirectoryPort().listDevices(idpUrl, accessToken), port.getDeviceId()])
            .then(([{ devices }, thisDevice]) => {
                if (!live) return
                const next = rosterRows(devices, thisDevice)
                // A read that changed nothing a screen shows keeps the rows, and what is derived from them.
                setRows((known) => (known && deviceListKey(known) === deviceListKey(next) && sameActivity(known, next) ? known : next))
                setFailed(false)
            })
            .catch((error: unknown) => {
                warnE2ee("reading the device list", error)
                if (live) setFailed(true)
            })
        return () => {
            live = false
        }
    }, [signedIn, verdict, reads])

    const waiting = rows ? waitingDevices({ devices: rows, events, verdict, requests: seats.open }) : []
    const fromBefore = rows ? fromBeforeDevices({ devices: rows, events, verdict }) : []
    return { rows, failed, reload: useCallback(() => setReads((n) => n + 1), []), events, verdict, answering, seats, waiting, fromBefore }
}

// What `deviceListKey` leaves out and the rows show: activity, sessions, the generation each says it holds.
function sameActivity(a: readonly RosterDevice[], b: readonly RosterDevice[]): boolean {
    return a.every((d, i) => {
        const other = b[i]
        return (
            other !== undefined &&
            d.is_current === other.is_current &&
            d.signed_in === other.signed_in &&
            d.last_active_at === other.last_active_at &&
            d.last_seen_at === other.last_seen_at &&
            d.history_generation === other.history_generation
        )
    })
}
