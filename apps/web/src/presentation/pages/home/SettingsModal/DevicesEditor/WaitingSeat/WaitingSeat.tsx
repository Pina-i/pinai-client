import { Check, Compass } from "lucide-react"
import { useEffect, useRef } from "react"

import type { SeatsView } from "@pinai/domain/models/approval-handshake"
import type { ApprovalAnswering } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { OtpInput } from "@/presentation/atoms/OtpInput/OtpInput"
import type { DeviceRow } from "@/presentation/hooks/useDevices"
import { cn } from "@/presentation/_libs/utils"

import { pill } from "../../editor-styles"
import { useWaitingSeatViewModel } from "./WaitingSeat.viewmodel"

interface WaitingSeatProps {
    device: DeviceRow
    answering: ApprovalAnswering | null
    seats: SeatsView
    /** Revokes it, through the revoke flow and its recent-password step. */
    onNotMine: () => void
    isRevoking: boolean
}

const line = "m-0 text-[12px] leading-[1.5] outline-none"

/** A device nobody approved, as a dashed seat at the top of the list: the code its request asks for, when it asks. */
export function WaitingSeat({ device, answering, seats, onNotMine, isRevoking }: WaitingSeatProps) {
    const vm = useWaitingSeatViewModel({ device, answering, seats })
    const { answer, label } = vm
    const cancel = useRef<HTMLButtonElement>(null)
    const settled = useRef<HTMLParagraphElement>(null)
    const failed = useRef<HTMLParagraphElement>(null)
    const kind = useRef(answer.kind)

    // The pressed Approve goes away under the hand: the focus follows the exchange.
    useEffect(() => {
        if (kind.current === answer.kind) return
        kind.current = answer.kind
        if (answer.kind === "working") cancel.current?.focus()
        else if (answer.kind === "approved") settled.current?.focus()
        else if (answer.kind === "failed") failed.current?.focus()
    }, [answer.kind])

    return (
        <div
            className="rounded-[14px] border-[1.5px] border-dashed border-[color-mix(in_oklab,var(--idle)_55%,transparent)] bg-[color-mix(in_oklab,var(--idle)_5%,transparent)] px-3.5 py-3"
            data-seat={device.device_id}
        >
            <div className="flex items-center gap-[11px]">
                <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_oklab,var(--idle)_14%,transparent)] text-idle">
                    <Compass className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
                    <span
                        aria-hidden
                        className="absolute -right-[3px] -top-[3px] h-[9px] w-[9px] rounded-full bg-idle shadow-[0_0_0_2px_var(--background)] motion-safe:animate-[pn-wait-ring_1.6s_ease-in-out_infinite]"
                    />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-[7px]">
                        <span className="title text-[13.5px] font-medium text-foreground [overflow-wrap:anywhere]">{label}</span>
                        <span className="rounded-full bg-[color-mix(in_oklab,var(--idle)_16%,transparent)] px-[7px] py-px font-mono text-[9px] uppercase tracking-[0.08em] text-idle-ink">
                            waiting for you
                        </span>
                    </div>
                    <div className="mt-[3px] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-mono text-[10.5px] text-muted-foreground">{vm.since}</span>
                        <span className="flex items-center gap-2">
                            <span className="text-line2" aria-hidden>
                                ·
                            </span>
                            <span className="font-mono text-[10.5px] text-muted-foreground">reads nothing of yours until you approve it</span>
                        </span>
                    </div>
                </div>
                {vm.offersNotMine && (
                    <button
                        type="button"
                        onClick={onNotMine}
                        disabled={isRevoking}
                        aria-label={isRevoking ? undefined : `Not mine: sign out ${label}`}
                        className="shrink-0 cursor-pointer self-start rounded-md px-1 py-1.5 text-[12.5px] text-dnd-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isRevoking ? "Signing out…" : "Not mine"}
                    </button>
                )}
            </div>

            {answer.kind !== "asks-nothing" && (
                <div className="mt-3 flex flex-col gap-2 border-t border-dashed border-[color-mix(in_oklab,var(--idle)_40%,transparent)] pt-3">
                    <div role="status" aria-live="polite">
                        {vm.note && <p className={cn(line, "text-dnd-ink")}>{vm.note}</p>}
                        {vm.hold && <p className={cn(line, "text-muted-foreground")}>{vm.hold}</p>}
                    </div>
                    {answer.kind === "code" && (
                        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
                            <OtpInput
                                label={`Type the code ${label} shows`}
                                value={vm.code}
                                onChange={vm.setCode}
                                groupSize={3}
                                size="sm"
                                inline
                                disabled={vm.hold !== null}
                            />
                            <button type="button" onClick={vm.onApprove} disabled={!vm.canApprove} className={pill({ variant: "save" })}>
                                Approve
                            </button>
                            <span className="ml-auto font-mono text-[10px] tracking-[0.03em] text-muted-foreground">
                                a wrong code ends the request
                            </span>
                        </div>
                    )}
                    {answer.kind === "at-door" && (
                        <p className={cn(line, "text-muted-foreground")}>Being answered in the approval prompt.</p>
                    )}
                    {answer.kind === "working" && (
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                            <p className={cn(line, "text-muted-foreground")}>Checking the code with {label}…</p>
                            <span className="flex items-center gap-2">
                                <button ref={cancel} type="button" onClick={vm.onCancel} className={pill({ variant: "cancel" })}>
                                    Cancel
                                </button>
                                <button type="button" disabled className={pill({ variant: "save" })}>
                                    Approving…
                                </button>
                            </span>
                        </div>
                    )}
                    <div role="status" aria-live="polite">
                        {answer.kind === "approved" && (
                            <p ref={settled} tabIndex={-1} className={cn(line, "flex items-center gap-2 text-muted-foreground")}>
                                <Check className="h-3.5 w-3.5 shrink-0 text-on" strokeWidth={2.2} aria-hidden />
                                {label} is one of your devices now.
                            </p>
                        )}
                    </div>
                    <div role="alert">
                        {vm.failure && (
                            <p ref={failed} tabIndex={-1} className={cn(line, "text-dnd-ink")}>
                                {vm.failure}
                            </p>
                        )}
                        {vm.error && <p className={cn(line, "text-dnd-ink")}>{vm.error}</p>}
                    </div>
                </div>
            )}
        </div>
    )
}
