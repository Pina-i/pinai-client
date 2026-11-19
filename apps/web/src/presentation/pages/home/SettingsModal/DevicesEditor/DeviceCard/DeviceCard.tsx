import { HelpCircle, KeyRound, Laptop, Pencil, Smartphone, Tablet } from "lucide-react"

import { deviceStatus } from "@pinai/domain/models/device"

import type { DeviceRow } from "@/presentation/hooks/useDevices"
import { activityLabel } from "@/presentation/_libs/device-activity"
import { dayLabel } from "@/presentation/_libs/day-label"
import { deviceFingerprint } from "@/presentation/_libs/device-fingerprint"
import { cn } from "@/presentation/_libs/utils"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Logo } from "@/presentation/atoms/Logo/Logo"
import { InlineNameField } from "@/presentation/molecules/InlineNameField/InlineNameField"
import { WithheldNote } from "@/presentation/molecules/WithheldNote/WithheldNote"

import { pill } from "../../editor-styles"
import { type RenameDevice, useDeviceCardViewModel } from "./DeviceCard.viewmodel"

interface DeviceCardProps {
    device: DeviceRow
    /** It says it holds the current generation of the history passphrase. */
    holdsHistory: boolean
    /** "this device", another's label, "your 24 words": this device's own verdict, `null` when it doesn't act. */
    approvedBy: string | null
    /** Pressed when the user clicks "Revoke" on a still-active row. */
    onRevoke: () => void
    /** Why "Revoke" isn't offered, in its place: an approved device, from one that isn't. */
    revokeWithheld?: string | null
    /** True while a revoke for this device is in flight. */
    isRevoking?: boolean
    /** The pencil; absent on a revoked device and where Revoke's rule refuses. */
    onRename?: RenameDevice
}

const KIND_ICON_PROPS = "h-3.5 w-3.5"
const tag = "rounded-full px-[7px] py-px font-mono text-[9px] uppercase tracking-[0.08em]"
const fact = "font-mono text-[10.5px] text-muted-foreground"

const KIND_WORD: Record<DeviceRow["kind"], string> = { laptop: "Laptop", phone: "Phone", tablet: "Tablet", unknown: "Unknown device" }

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

export function DeviceCard({ device, holdsHistory, approvedBy, onRevoke, revokeWithheld = null, isRevoking, onRename }: DeviceCardProps) {
    const { pencilRef, nameRef, ...rename } = useDeviceCardViewModel(device, onRename)
    const isRevoked = device.revoked_at !== null
    const isCurrent = device.is_current
    const isSignedOut = !isRevoked && !isCurrent && deviceStatus(device).kind === "signed-out"

    const lastSeenLabel = activityLabel(device)
    const showLivePulse = lastSeenLabel === "Active now" || lastSeenLabel === "Active just now"
    const facts = [
        ...(device.chosen_name !== null ? [device.automatic_name] : []),
        ...(approvedBy ? [`approved by ${approvedBy}`] : []),
        `paired ${dayLabel(device.paired_at)}`,
        deviceFingerprint(device.device_id),
    ]

    // Out of use: its icon, name and tags step back; the facts, the pencil and Revoke keep their contrast.
    const out = (isRevoked || isSignedOut) && "opacity-60"

    return (
        <div
            className={cn(
                "rounded-[14px] border bg-(--card-bg) px-3.5 py-3",
                isCurrent
                    ? "border-[color-mix(in_oklab,var(--acc)_30%,var(--line2))] [--card-bg:color-mix(in_oklab,var(--acc)_8%,var(--background))]"
                    : "border-line [--card-bg:var(--background)]",
            )}
        >
            <div className="flex items-center gap-[11px]">
                <span
                    role="img"
                    aria-label={device.client === "app" ? `${KIND_WORD[device.kind]}, Pīna'i app` : KIND_WORD[device.kind]}
                    className={cn(
                        "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
                        isCurrent ? "bg-acc text-acc-ink" : "bg-surf3 text-foreground",
                        out,
                    )}
                >
                    {kindIcon(device.kind)}
                    {/* Ringed in the card's own background, so it reads on either card. */}
                    {device.client === "app" && (
                        <span className="absolute -bottom-[5px] -right-[5px] flex h-[17px] w-[17px] items-center justify-center rounded-full border-2 border-(--card-bg) bg-[color-mix(in_oklab,var(--foreground)_8%,var(--card-bg))]">
                            <Logo className="h-2 w-[11px] text-foreground" />
                        </span>
                    )}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-[7px]">
                        {rename.isEditing ? (
                            <InlineNameField
                                label="Device name"
                                value={rename.draft}
                                onChange={rename.setDraft}
                                placeholder={device.automatic_name}
                                isPending={rename.isSaving}
                                error={rename.failure}
                                onSave={() => void rename.saveRename()}
                                onCancel={rename.cancelRename}
                                className="w-[min(280px,100%)]"
                            />
                        ) : (
                            <span className="flex min-w-0 items-center gap-0.5">
                                <span ref={nameRef} tabIndex={-1} className={cn("title truncate text-[13.5px] font-medium text-foreground outline-none", out)}>
                                    {device.display_name}
                                </span>
                                {onRename && (
                                    <IconButton
                                        ref={pencilRef}
                                        variant="ghost"
                                        aria-label={`Rename ${device.display_name}`}
                                        onPress={rename.startRename}
                                        className="-my-1 h-6 w-6"
                                    >
                                        <Pencil className="h-3 w-3" />
                                    </IconButton>
                                )}
                            </span>
                        )}
                        {isCurrent && <span className={cn(tag, "bg-[color-mix(in_oklab,var(--acc)_22%,transparent)] text-acc")}>this device</span>}
                        {isRevoked && <span className={cn(tag, "bg-surf3 text-muted-foreground", out)}>revoked</span>}
                        {isSignedOut && <span className={cn(tag, "bg-surf3 text-muted-foreground", out)}>signed out</span>}
                        {holdsHistory && (
                            <span className={cn(tag, "inline-flex items-center gap-1 bg-acc-soft text-acc", out)}>
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
                    {!isRevoked && !isCurrent && revokeWithheld && <WithheldNote className="mt-1">{revokeWithheld}</WithheldNote>}
                </div>
                {!isRevoked && !isCurrent && !revokeWithheld && (
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
