import type { SeatsView } from "@pinai/domain/models/approval-handshake"
import { waitingDevices } from "@pinai/domain/models/device-roster"
import type { DeviceTrustVerdict, TrustEvent } from "@pinai/domain/models/device-trust"
import type { ApprovalAnswering } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { useSeats, useSharedApprovalAnswering } from "@/presentation/hooks/use-approval-answering"
import { useDevices, type DeviceRow } from "@/presentation/hooks/useDevices"
import { useDeviceVerdict, useTrustEvents } from "@/presentation/hooks/use-trust-events"

export interface DeviceRoster {
    rows: DeviceRow[] | undefined
    isLoading: boolean
    error: unknown
    events: TrustEvent[]
    verdict: DeviceTrustVerdict | null
    answering: ApprovalAnswering | null
    seats: SeatsView
    /** Who waits for the user (`waitingDevices`): Settings → Devices' seats, and the count on its tile. */
    waiting: DeviceRow[]
}

/** The account's devices as this device judges them, with the answering side the Door shares. */
export function useDeviceRoster(): DeviceRoster {
    const { rows, isLoading, error } = useDevices()
    const events = useTrustEvents()
    const verdict = useDeviceVerdict()
    const answering = useSharedApprovalAnswering()
    const seats = useSeats(answering)
    const waiting = rows ? waitingDevices({ devices: rows, events, verdict, requests: seats.open }) : []
    return { rows, isLoading, error, events, verdict, answering, seats, waiting }
}
