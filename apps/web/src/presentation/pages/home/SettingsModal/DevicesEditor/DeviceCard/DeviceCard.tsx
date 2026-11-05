import { HelpCircle, KeyRound, Laptop, Smartphone, Tablet } from "lucide-react"

import { deviceStatus } from "@pinai/domain/models/device"

import type { DeviceRow } from "@/presentation/hooks/useDevices"
import { activityLabel } from "@/presentation/_libs/device-activity"
import { dayLabel } from "@/presentation/_libs/day-label"
import { deviceFingerprint } from "@/presentation/_libs/device-fingerprint"
import { cn } from "@/presentation/_libs/utils"

import { pill } from "../../editor-styles"

interface DeviceCardProps {
    device: DeviceRow
    /** It says it holds the current generation of the history passphrase. */
    holdsHistory: boolean
    /** "this device", another's label, "your 24 words": this device's own verdict, `null` when it doesn't act. */
    approvedBy: string | null
    /** Pressed when the user clicks "Revoke" on a still-active row. */
    onRevoke: () => void
    /** True while a revoke for this device is in flight. */
    isRevoking?: boolean
}

const KIND_ICON_PROPS = "h-3.5 w-3.5"
const tag = "rounded-full px-[7px] py-px font-mono text-[9px] uppercase tracking-[0.08em]"
const fact = "font-mono text-[10.5px] text-muted-foreground"

function kindIcon(kind: DeviceRow["kind"]) {
    switch (kind) {
        case "phone":
            return <Smartphone className={KIND_ICON_PROPS} />
        case "tablet":
            return <Tablet className={KIND_ICON_PROPS} />
        case "laptop":
            return <Laptop className={KIND_ICON_PROPS} />
        default:
            return <HelpCircle className={KIND_ICON_PROPS} />
    }
}

export function DeviceCard({ device, holdsHistory, approvedBy, onRevoke, isRevoking }: DeviceCardProps) {
    const isRevoked = device.revoked_at !== null
    const isCurrent = device.is_current
    const isSignedOut = !isRevoked && !isCurrent && deviceStatus(device).kind === "signed-out"

    const lastSeenLabel = activityLabel(device)
    const showLivePulse = lastSeenLabel === "Active now" || lastSeenLabel === "Active just now"
    const facts = [
        ...(approvedBy ? [`approved by ${approvedBy}`] : []),
        `paired ${dayLabel(device.paired_at)}`,
        deviceFingerprint(device.device_id),
    ]

    // Out of use: its icon, name and tags step back; the facts and Revoke keep their contrast.
    const out = (isRevoked || isSignedOut) && "opacity-60"

    return (
        <div
            className={cn(
                "rounded-[14px] border px-3.5 py-3",
                isCurrent
                    ? "border-[color-mix(in_oklab,var(--acc)_30%,var(--line2))] bg-[color-mix(in_oklab,var(--acc)_8%,var(--background))]"
                    : "border-line bg-background",
            )}
        >
            <div className="flex items-center gap-[11px]">
                <span
                    className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
                        isCurrent ? "bg-acc text-acc-ink" : "bg-surf3 text-foreground",
                        out,
                    )}
                >
                    {kindIcon(device.kind)}
                </span>
                <div className="min-w-0 flex-1">
                    <div className={cn("flex flex-wrap items-center gap-[7px]", out)}>
                        <span className="title truncate text-[13.5px] font-medium text-foreground">{device.display_name}</span>
                        {isCurrent && <span className={cn(tag, "bg-[color-mix(in_oklab,var(--acc)_22%,transparent)] text-acc")}>this device</span>}
                        {isRevoked && <span className={cn(tag, "bg-surf3 text-muted-foreground")}>revoked</span>}
                        {isSignedOut && <span className={cn(tag, "bg-surf3 text-muted-foreground")}>signed out</span>}
                        {holdsHistory && (
                            <span className={cn(tag, "inline-flex items-center gap-1 bg-acc-soft text-acc")}>
                                <KeyRound className="h-2.5 w-2.5" strokeWidth={1.9} aria-hidden />
                                holds history
                            </span>
                        )}
                    </div>
                    <div className="mt-[3px] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {lastSeenLabel && (
                            <span className={cn("flex items-center gap-[5px] text-[11px]", showLivePulse ? "text-on" : "text-muted-foreground")}>
                                {showLivePulse && (
                                    <span className="inline-block h-[5px] w-[5px] rounded-full bg-on motion-safe:animate-[pn-pulse_1.6s_ease-in-out_infinite]" />
                                )}
                                {lastSeenLabel}
                            </span>
                        )}
                        {/* Each fact with the dot before it, so a wrapped line never ends on a dot. */}
                        {facts.map((item, i) => (
                            <span key={item} className="flex items-center gap-2">
                                {(i > 0 || lastSeenLabel) && (
                                    <span className="text-line2" aria-hidden>
                                        ·
                                    </span>
                                )}
                                <span className={fact}>{item}</span>
                            </span>
                        ))}
                    </div>
                </div>
                {!isRevoked && !isCurrent && (
                    <button
                        type="button"
                        onClick={onRevoke}
                        disabled={isRevoking}
                        aria-label={isRevoking ? undefined : `Revoke ${device.display_name}`}
                        className={pill({ variant: "revoke" })}
                    >
                        {isRevoking ? "Revoking…" : "Revoke"}
                    </button>
                )}
            </div>
        </div>
    )
}
