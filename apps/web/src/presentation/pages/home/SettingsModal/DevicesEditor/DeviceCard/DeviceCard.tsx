import { Laptop, Smartphone, Tablet, HelpCircle } from "lucide-react"

import type { DeviceRow } from "@/presentation/hooks/useDevices"
import { deviceFingerprint } from "@/presentation/_libs/device-fingerprint"
import { formatLastSeen } from "@/presentation/_libs/format-last-seen"
import { cn } from "@/presentation/_libs/utils"

interface DeviceCardProps {
    device: DeviceRow
    /** Pressed when the user clicks "Revoke" on a still-active row. */
    onRevoke: () => void
    /** True while a revoke for this device is in flight. */
    isRevoking?: boolean
}

const KIND_ICON_PROPS = "h-3.5 w-3.5"

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

function pairedDateLabel(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
    })
}

export function DeviceCard({ device, onRevoke, isRevoking }: DeviceCardProps) {
    const isRevoked = device.revoked_at !== null
    const isCurrent = device.is_current

    const lastSeenLabel = isRevoked
        ? `Signed out ${pairedDateLabel(device.revoked_at!)}`
        : formatLastSeen(device.last_seen_at)
    const showLivePulse = !isRevoked && lastSeenLabel === "just now"

    return (
        <div
            className={cn(
                "rounded-[10px] px-3.5 py-3 transition-opacity",
                isCurrent
                    ? "border bg-[color-mix(in_oklab,var(--chat)_8%,var(--background))] border-[color-mix(in_oklab,var(--chat)_30%,var(--border))]"
                    : "border border-border bg-background",
                isRevoked && "opacity-60",
            )}
        >
            <div className="flex items-center gap-[11px]">
                <span
                    className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px]",
                        isCurrent
                            ? "bg-chat text-primary-foreground"
                            : "bg-muted text-foreground",
                    )}
                >
                    {kindIcon(device.kind)}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-[7px]">
                        <span className="truncate font-serif text-[13.5px] font-medium text-foreground">
                            {device.display_name}
                        </span>
                        {isCurrent && (
                            <span className="rounded-[4px] bg-[color-mix(in_oklab,var(--chat)_22%,transparent)] px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.08em] text-chat">
                                this device
                            </span>
                        )}
                        {isRevoked && (
                            <span className="rounded-[4px] bg-muted px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                                signed out
                            </span>
                        )}
                    </div>
                    <div className="mt-[3px] flex items-center gap-2">
                        <span
                            className={cn(
                                "flex items-center gap-[5px] text-[11px]",
                                showLivePulse ? "text-success" : "text-muted-foreground",
                            )}
                        >
                            {showLivePulse && (
                                <span className="inline-block h-[5px] w-[5px] animate-pulse rounded-full bg-success" />
                            )}
                            {lastSeenLabel}
                        </span>
                        <span className="text-border-strong">·</span>
                        <span className="font-mono text-[10.5px] text-muted-foreground">
                            paired {pairedDateLabel(device.paired_at)}
                        </span>
                        <span className="text-border-strong">·</span>
                        <span className="font-mono text-[10.5px] text-muted-foreground">
                            {deviceFingerprint(device.device_id)}
                        </span>
                    </div>
                </div>
                {!isRevoked && !isCurrent && (
                    <button
                        type="button"
                        onClick={onRevoke}
                        disabled={isRevoking}
                        className={cn(
                            "h-7 shrink-0 cursor-pointer rounded-[6px] border border-destructive bg-transparent px-2.5",
                            "font-sans text-[11px] text-destructive",
                            "hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50",
                        )}
                    >
                        {isRevoking ? "Revoking…" : "Revoke"}
                    </button>
                )}
            </div>
        </div>
    )
}
