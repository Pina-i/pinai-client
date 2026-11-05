import { Check, ChevronsRight, History, Laptop, Monitor, Smartphone, Tablet } from "lucide-react"

import type { DeviceKind } from "@pinai/domain/models/device"
import type { AwaitedShareState } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { Button } from "@/presentation/atoms/Button/Button"
import { cn } from "@/presentation/_libs/utils"

import { useApproveFromAnotherDeviceViewModel } from "./ApproveFromAnotherDevice.viewmodel"

const RING = 2 * Math.PI * 15

interface ApproveFromAnotherDeviceProps {
    /** The device is registered and named on its session: a request can open. */
    ready: boolean
    /** Its tab is open: leaving it ends the request, coming back opens one. */
    active: boolean
    /** This device's label until the instance's list names it. */
    fallbackLabel: string
    /** Where to type the code. */
    instruction?: string
    /** The page's wait for this device's key share. */
    share?: AwaitedShareState | null
    /** Approved here: the page leaves the way on to this section. */
    onApproved?: () => void
    /** Approved, its words kept and its history restored — or let in with no share yet: on to the app. */
    onIn?: () => void
}

/**
 * The code to type on an approved device: "Pass"'s "Another device" tab
 * (`identity-provider/docs/plans/2026-11-02-history-key-sharing-design.md § 5.2`).
 */
export function ApproveFromAnotherDevice({
    ready,
    active,
    fallbackLabel,
    instruction = "Open Pīna'i on one of your devices and type it when it asks.",
    share,
    onApproved,
    onIn,
}: ApproveFromAnotherDeviceProps) {
    const vm = useApproveFromAnotherDeviceViewModel({ ready, active, fallbackLabel, share, onApproved, onIn })
    const approved = vm.state.kind === "approved"

    return (
        <section aria-label="Approve from another device">
            <div className="px-[30px] pb-[22px] pt-[26px] max-[440px]:px-5">
                <div className="flex items-center justify-between gap-3">
                    <p className="fact text-acc">Approval code</p>
                    {vm.nextCode && vm.ringFraction !== null && (
                        <span className="inline-flex h-[26px] items-center gap-[7px] rounded-full border border-line bg-surf2 pl-1.5 pr-2.5">
                            <svg width="18" height="18" viewBox="0 0 36 36" aria-hidden>
                                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--line2)" strokeWidth="4" />
                                <circle
                                    cx="18"
                                    cy="18"
                                    r="15"
                                    fill="none"
                                    stroke="var(--acc)"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    strokeDasharray={`${vm.ringFraction * RING} ${RING}`}
                                    transform="rotate(-90 18 18)"
                                />
                            </svg>
                            <span className="fact fact-plain">{vm.nextCode}</span>
                        </span>
                    )}
                </div>

                {approved ? (
                    <p className="title m-0 mt-[22px] flex items-center justify-center gap-3 text-[30px] leading-[1.1] text-foreground max-[440px]:text-[24px]">
                        <Check className="h-7 w-7 text-on" strokeWidth={2.2} aria-hidden />
                        This device is approved.
                    </p>
                ) : (
                    <CodeDigits halves={vm.halves} />
                )}

                {!approved && (
                    <p className="m-0 mt-4 text-center text-[14px] leading-[1.55] text-muted-foreground">
                        {instruction}
                    </p>
                )}
                {/* Mounted throughout, so each change is announced. */}
                <p role="status" className="m-0 mt-2 min-h-[1lh] text-center text-[12.5px] text-muted-foreground">
                    {vm.status}
                </p>
                {vm.action && (
                    <div className="mt-3 flex justify-center">
                        <Button size="inline" variant="secondary" onPress={vm.onAction}>
                            {vm.action === "new-code" ? "New code" : "Go on without it"}
                        </Button>
                    </div>
                )}
            </div>

            <div className="mx-[30px] grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3.5 border-t border-line py-[18px] max-[440px]:mx-5 max-[440px]:gap-2.5">
                <div className="min-w-0">
                    <p className="m-0 mb-2 text-[11px] font-medium text-muted-foreground">Letting in</p>
                    <div className="flex items-center gap-2.5">
                        <DeviceIcon kind={vm.thisDeviceKind} />
                        <span className="min-w-0">
                            <span className="block break-words text-[13px] text-foreground">{vm.thisDevice}</span>
                            <span className="fact fact-plain">this device</span>
                        </span>
                    </div>
                </div>
                <span aria-hidden className="flex items-center gap-1 pt-[18px] text-acc">
                    <i className="h-0 w-[26px] border-t-[1.5px] border-dashed border-acc-line" />
                    <ChevronsRight className="h-[15px] w-[15px]" strokeWidth={1.9} />
                </span>
                <div className="min-w-0">
                    <p className="m-0 mb-2 text-[11px] font-medium text-muted-foreground">Approve from</p>
                    <div className="flex flex-col gap-2">
                        {vm.approvers.length === 0 && <span className="text-[13px] text-muted-foreground">Another of your devices</span>}
                        {vm.approvers.map((d) => (
                            <div key={d.deviceId} className="flex items-center gap-2.5">
                                <DeviceIcon kind={d.kind} />
                                <span className="min-w-0 break-words text-[13px] text-foreground">{d.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 border-t border-acc-line bg-acc-soft px-[30px] py-3.5 max-[440px]:px-5">
                <History className="h-4 w-4 shrink-0 text-acc" strokeWidth={1.9} aria-hidden />
                <span className="text-[13px] text-foreground">
                    <span className="mr-2 text-[11px] font-medium text-muted-foreground">Then</span>your conversations and history arrive here
                </span>
            </div>
        </section>
    )
}

function CodeDigits({ halves }: { halves: [string, string] | null }) {
    const [first, second] = halves ?? ["", ""]
    const tile = (digit: string | undefined, key: string) => (
        <span
            key={key}
            className={cn(
                "title relative flex h-[76px] w-14 items-center justify-center rounded-[14px] border border-line2 bg-surf2",
                "text-[50px] leading-none text-foreground max-[520px]:h-16 max-[520px]:w-11 max-[520px]:text-[40px]",
                "max-[440px]:h-14 max-[440px]:w-[38px] max-[440px]:rounded-[11px] max-[440px]:text-[32px]",
            )}
        >
            {digit ?? ""}
            <i className="absolute bottom-2.5 left-3.5 right-3.5 h-0.5 rounded-sm bg-action max-[440px]:bottom-2 max-[440px]:left-2.5 max-[440px]:right-2.5" />
        </span>
    )
    return (
        <div
            role="img"
            aria-label={halves ? `Approval code ${spelled(first)}, ${spelled(second)}` : "Approval code coming"}
            className="mt-[22px] flex items-center justify-center gap-2 max-[440px]:gap-1.5"
        >
            {[0, 1, 2].map((i) => tile(first[i], `a${i}`))}
            <span aria-hidden className="mx-2 h-2 w-2 shrink-0 rounded-full bg-line2 max-[440px]:mx-1.5" />
            {[0, 1, 2].map((i) => tile(second[i], `b${i}`))}
        </div>
    )
}

function DeviceIcon({ kind }: { kind: DeviceKind }) {
    const Icon = kind === "laptop" ? Laptop : kind === "phone" ? Smartphone : kind === "tablet" ? Tablet : Monitor
    return (
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[12px] border border-line bg-surf2 text-foreground">
            <Icon className="h-4 w-4" strokeWidth={1.9} aria-hidden />
        </span>
    )
}

// Read digit by digit, not as "four hundred eighty-two".
function spelled(digits: string): string {
    return [...digits].join(" ")
}
