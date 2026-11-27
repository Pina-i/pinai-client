import { useEffect, useState } from "react"

import { UNREACHABLE_LINE } from "@pinai/domain/models/approval-wording"
import { codeDigits, isWholeCode, type SeatAnswer, type SeatsView } from "@pinai/domain/models/approval-handshake"
import { seatCanApprove, seatState, type SeatKind } from "@pinai/domain/models/waiting-seat"
import type { ApprovalAnswering } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { dayLabel } from "@/presentation/_libs/day-label"
import { warnOf as warn } from "@/presentation/_libs/key-share-deps"
import type { DeviceRow } from "@/presentation/hooks/useDevices"

export type { SeatKind }

export interface WaitingSeatViewModel {
    answer: SeatAnswer
    label: string
    /** "asked 4 minutes ago" while it asks, else "paired 14 Mar 2026" — or, from before, its last activity. */
    since: string | null
    code: string
    setCode: (text: string) => void
    canApprove: boolean
    onApprove: () => void
    onCancel: () => void
    /** A wrong code before this request, as the Door says it. */
    note: string | null
    /** Why the code wasn't tried, or the instance out of reach. */
    error: string | null
    /** Why no code is taken yet. */
    hold: string | null
    failure: string | null
    /** "Not mine" — "Sign out" from before — stays until the exchange is under way. */
    offersNotMine: boolean
}

export function useWaitingSeatViewModel(input: {
    device: DeviceRow
    answering: ApprovalAnswering | null
    seats: SeatsView
    kind?: SeatKind
}): WaitingSeatViewModel {
    const { device, answering, seats, kind = "waiting" } = input
    const [now, setNow] = useState(() => Date.now())
    const state = seatState({ device, seats, kind, now: new Date(now), day: dayLabel })
    const { answer, requestId } = state
    // Typed for one request: a new request starts empty.
    const [typed, setTyped] = useState<{ requestId: string | null; code: string; error: string | null }>({
        requestId: null,
        code: "",
        error: null,
    })
    const code = typed.requestId === requestId ? typed.code : ""
    const reachError = typed.requestId === requestId ? typed.error : null

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30_000)
        return () => clearInterval(timer)
    }, [])

    const onApprove = () => {
        if (!answering || !requestId || !isWholeCode(code)) return
        setTyped({ requestId, code, error: null })
        answering.answerAt(requestId, code).catch((e: unknown) => {
            warn("answering the request")(e)
            setTyped({ requestId, code, error: UNREACHABLE_LINE })
        })
    }

    return {
        answer,
        label: state.label,
        since: state.since,
        code,
        setCode: (text: string) => setTyped({ requestId, code: codeDigits(text), error: null }),
        canApprove: seatCanApprove(state, seats, code),
        onApprove,
        onCancel: () => void answering?.cancel().catch(warn("cancelling the exchange")),
        note: state.note,
        error: reachError ?? state.refusal,
        hold: state.hold,
        failure: state.failure,
        offersNotMine: state.offersNotMine,
    }
}
