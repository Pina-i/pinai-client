import { useEffect, useState } from "react"

import { codeDigits, isWholeCode, seatAnswer, type SeatAnswer, type SeatsView } from "@pinai/domain/models/approval-handshake"
import { formatLastSeen } from "@pinai/domain/models/relative-time"
import type { ApprovalAnswering } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { failureWording, refusalWording } from "@/presentation/_libs/approval-wording"
import { dayLabel } from "@/presentation/_libs/day-label"
import { activityLabel } from "@/presentation/_libs/device-activity"
import { warnOf as warn } from "@/presentation/_libs/key-share-deps"
import type { DeviceRow } from "@/presentation/hooks/useDevices"

/**
 * `waiting`: a device that appeared unapproved; `from-before`: one listed as this device set its
 * generation over others, waiting for nobody; `refused`: the one the user said reset the history.
 */
export type SeatKind = "waiting" | "from-before" | "refused"

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
    // The refused device is offered no code: approving it would hand it the account.
    const answer: SeatAnswer = kind === "refused" ? { kind: "asks-nothing" } : seatAnswer(device.device_id, seats)
    const request = answer.kind === "asks-nothing" ? null : answer.request
    const requestId = request?.id ?? null
    // Typed for one request: a new request starts empty.
    const [typed, setTyped] = useState<{ requestId: string | null; code: string; error: string | null }>({
        requestId: null,
        code: "",
        error: null,
    })
    const code = typed.requestId === requestId ? typed.code : ""
    const reachError = typed.requestId === requestId ? typed.error : null
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30_000)
        return () => clearInterval(timer)
    }, [])

    const onApprove = () => {
        if (!answering || !requestId || !isWholeCode(code)) return
        setTyped({ requestId, code, error: null })
        answering.answerAt(requestId, code).catch((e: unknown) => {
            warn("answering the request")(e)
            setTyped({ requestId, code, error: "Couldn't reach your instance. Try again." })
        })
    }

    const label = device.display_name.trim() || "A device"
    const takesCode = answer.kind === "code"
    const idle = kind === "waiting" ? `paired ${dayLabel(device.paired_at)}` : activityLabel(device, new Date(now))
    return {
        answer,
        label,
        since: request ? `asked ${formatLastSeen(request.createdAt, new Date(now)) ?? "just now"}` : idle,
        code,
        setCode: (text: string) => setTyped({ requestId, code: codeDigits(text), error: null }),
        canApprove: takesCode && isWholeCode(code) && !seats.busy && !seats.unsettled,
        onApprove,
        onCancel: () => void answering?.cancel().catch(warn("cancelling the exchange")),
        note: takesCode && answer.note === "wrong-code" ? "That code didn't match — type the new one it shows." : null,
        error: reachError ?? (takesCode ? refusalWording(answer.refused) : null),
        hold: takesCode && seats.unsettled ? "This device can't approve yet: it's still finishing setting up your history passphrase." : null,
        failure: answer.kind === "failed" ? failureWording(answer.failure, label) : null,
        offersNotMine: answer.kind !== "working" && answer.kind !== "approved",
    }
}
