import { isWholeCode, type AnsweringView, type DoorSummons } from "./approval-handshake"
import { shownDeviceName } from "./device"

/** The Door's name, as its stage reads. */
export function doorTitle(view: AnsweringView | null): string {
    if (view?.stage === "approved") return "Approved"
    if (view?.stage === "working") return "Approving"
    if (view?.stage === "failed") return "Not approved"
    return "Is this you?"
}

export interface DoorState {
    /** A request shows, or a device was summoned. */
    isOpen: boolean
    /** Summoned, no code from it yet: the Door waits for it. */
    waiting: boolean
    /** The device asking, or the one summoned. */
    target: DoorSummons | null
    device: string
}

export function doorState(view: AnsweringView | null, summons: DoorSummons | null): DoorState {
    const target = view ? { deviceId: view.request.deviceId, displayName: view.request.displayName } : summons
    return {
        isOpen: view !== null || summons !== null,
        waiting: view === null && summons !== null,
        target,
        device: shownDeviceName(target?.displayName),
    }
}

export function doorCanApprove(view: AnsweringView | null, code: string): boolean {
    return view?.stage === "entry" && isWholeCode(code)
}
