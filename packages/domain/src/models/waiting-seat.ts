import { isWholeCode, seatAnswer, type SeatAnswer, type SeatsView } from "./approval-handshake"
import { failureWording, refusalWording } from "./approval-wording"
import { activityLabel, shownDeviceName, type DeviceListEntry } from "./device"
import { formatLastSeen } from "./relative-time"

/**
 * `waiting`: a device that appeared unapproved; `from-before`: one listed as this device set its
 * generation over others, waiting for nobody; `refused`: the one the user said reset the history.
 */
export type SeatKind = "waiting" | "from-before" | "refused"

export const SEAT_WRONG_CODE_NOTE = "That code didn't match — type the new one it shows."
export const SEAT_HOLD = "This device can't approve yet: it's still finishing setting up your history passphrase."

export interface SeatState {
    answer: SeatAnswer
    requestId: string | null
    label: string
    /** "asked 4 minutes ago" while it asks, else "paired <day>" — or, from before and refused, its last activity. */
    since: string | null
    takesCode: boolean
    /** A wrong code before this request. */
    note: string | null
    /** Why a code wasn't tried: one tried already, another tab answering. */
    refusal: string | null
    /** Why no code is taken yet. */
    hold: string | null
    failure: string | null
    /** "Not mine" — "Sign out" from before — until the exchange is under way. */
    offersNotMine: boolean
}

export function seatState(input: {
    device: DeviceListEntry & { is_current?: boolean }
    seats: SeatsView
    kind: SeatKind
    now: Date
    day: (iso: string) => string
}): SeatState {
    const { device, seats, kind, now, day } = input
    // The refused device is offered no code: approving it would hand it the account.
    const answer: SeatAnswer = kind === "refused" ? { kind: "asks-nothing" } : seatAnswer(device.device_id, seats)
    const request = answer.kind === "asks-nothing" ? null : answer.request
    const code = answer.kind === "code" ? answer : null
    const label = shownDeviceName(device.display_name)
    return {
        answer,
        requestId: request?.id ?? null,
        label,
        since: request
            ? `asked ${formatLastSeen(request.createdAt, now) ?? "just now"}`
            : kind === "waiting"
              ? `paired ${day(device.paired_at)}`
              : activityLabel(device, now, day),
        takesCode: code !== null,
        note: code?.note === "wrong-code" ? SEAT_WRONG_CODE_NOTE : null,
        refusal: code ? refusalWording(code.refused) : null,
        hold: code && seats.unsettled ? SEAT_HOLD : null,
        failure: answer.kind === "failed" ? failureWording(answer.failure, label) : null,
        offersNotMine: answer.kind !== "working" && answer.kind !== "approved",
    }
}

export function seatCanApprove(state: SeatState, seats: SeatsView, code: string): boolean {
    return state.takesCode && isWholeCode(code) && !seats.busy && !seats.unsettled
}
