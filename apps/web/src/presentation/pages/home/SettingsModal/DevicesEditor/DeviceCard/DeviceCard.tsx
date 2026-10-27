import { Laptop, Smartphone, Tablet, HelpCircle } from "lucide-react"

import { deviceStatus } from "@pinai/domain/models/device"
import { formatLastSeen } from "@pinai/domain/models/relative-time"

import type { DeviceRow } from "@/presentation/hooks/useDevices"
import { deviceFingerprint } from "@/presentation/_libs/device-fingerprint"
import { cn } from "@/presentation/_libs/utils"

import { pill } from "../../editor-styles"

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

function statusLabel(device: DeviceRow): string {
    // This device is in use as the list is read, whatever its session's last renewal says.
    if (device.is_current) return "Active now"
    const status = deviceStatus(device)
    switch (status.kind) {
        case "revoked":
            return `Revoked ${pairedDateLabel(status.at)}`
        case "signed-in": {
            const seen = status.lastActiveAt && formatLastSeen(status.lastActiveAt, new Date())
            return seen ? `Active ${seen}` : "Signed in"
        }
        case "signed-out":
            return "Signed out"
    }
}

export function DeviceCard({ device, onRevoke, isRevoking }: DeviceCardProps) {
    const isRevoked = device.revoked_at !== null
    const isCurrent = device.is_current

    const lastSeenLabel = statusLabel(device)
    const showLivePulse = lastSeenLabel === "Active now" || lastSeenLabel === "Active just now"

    return (
        <div
            className={cn(
                "rounded-[14px] border px-3.5 py-3 transition-opacity",
                isCurrent
                    ? "border-[color-mix(in_oklab,var(--acc)_30%,var(--line2))] bg-[color-mix(in_oklab,var(--acc)_8%,var(--background))]"
                    : "border-line bg-background",
                isRevoked && "opacity-60",
            )}
        >
            <div className="flex items-center gap-[11px]">
                <span
                    className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
                        isCurrent ? "bg-acc text-acc-ink" : "bg-surf3 text-foreground",
                    )}
                >
                    {kindIcon(device.kind)}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-[7px]">
                        <span className="title truncate text-[13.5px] font-medium text-foreground">
                            {device.display_name}
                        </span>
                        {isCurrent && (
                            <span className="rounded-full bg-[color-mix(in_oklab,var(--acc)_22%,transparent)] px-[7px] py-px font-mono text-[9px] uppercase tracking-[0.08em] text-acc">
                                this device
                            </span>
                        )}
                        {isRevoked && (
                            <span className="rounded-full bg-surf3 px-[7px] py-px font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                                revoked
                            </span>
                        )}
                    </div>
                    <div className="mt-[3px] flex flex-wrap items-center gap-2">
                        <span
                            className={cn(
                                "flex items-center gap-[5px] text-[11px]",
                                showLivePulse ? "text-on" : "text-muted-foreground",
                            )}
                        >
                            {showLivePulse && (
                                <span className="inline-block h-[5px] w-[5px] animate-[pn-pulse_1.6s_ease-in-out_infinite] rounded-full bg-on" />
                            )}
                            {lastSeenLabel}
                        </span>
                        <span className="text-line2">·</span>
                        <span className="font-mono text-[10.5px] text-muted-foreground">
                            paired {pairedDateLabel(device.paired_at)}
                        </span>
                        <span className="text-line2">·</span>
                        <span className="font-mono text-[10.5px] text-muted-foreground">
                            {deviceFingerprint(device.device_id)}
                        </span>
                    </div>
                </div>
                {!isRevoked && !isCurrent && (
                    <button type="button" onClick={onRevoke} disabled={isRevoking} className={pill({ variant: "revoke" })}>
                        {isRevoking ? "Revoking…" : "Revoke"}
                    </button>
                )}
            </div>
        </div>
    )
}
