import { UNREACHABLE_LINE } from "@pinai/domain/models/approval-wording"
import type { SeatsView } from "@pinai/domain/models/approval-handshake"
import type { RosterDevice } from "@pinai/domain/models/device-roster"
import { seatCanApprove, seatState, type SeatKind } from "@pinai/domain/models/waiting-seat"
import type { ApprovalAnswering } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { useState } from "react"
import { dayLabel } from "@/presentation/_libs/day-label"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useClock } from "@/presentation/hooks/use-clock"

/** A waiting device's sheet: its code typed here, through the Door's own answering side (`answerAt`). */
export function useSeatSheetViewModel(input: { device: RosterDevice; kind: SeatKind; answering: ApprovalAnswering | null; seats: SeatsView }) {
    const { device, kind, answering, seats } = input
    const now = useClock(true)
    const state = seatState({ device, seats, kind, now: new Date(now), day: dayLabel })
    const { requestId } = state
    // Typed for one request: a new request starts empty.
    const [typed, setTyped] = useState<{ requestId: string | null; code: string; error: string | null }>({ requestId: null, code: "", error: null })
    const code = typed.requestId === requestId ? typed.code : ""
    const reachError = typed.requestId === requestId ? typed.error : null

    return {
        state,
        code,
        setCode: (next: string) => setTyped({ requestId, code: next.slice(0, 6), error: null }),
        canApprove: seatCanApprove(state, seats, code),
        error: reachError ?? state.refusal,
        onApprove: () => {
            if (!answering || !requestId || !seatCanApprove(state, seats, code)) return
            setTyped({ requestId, code, error: null })
            answering.answerAt(requestId, code).catch((error: unknown) => {
                warnE2ee("answering the request", error)
                setTyped({ requestId, code, error: UNREACHABLE_LINE })
            })
        },
        onCancel: () => answering?.cancel().catch((error: unknown) => warnE2ee("cancelling the exchange", error)),
    }
}
