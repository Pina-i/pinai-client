import { Bell, BellOff, Minus, Plus } from "lucide-react"
import { cn } from "@/presentation/_libs/utils"
import { useMuteAllControlViewModel } from "./MuteAllControl.viewmodel"

const linkClass =
    "inline-flex cursor-pointer items-center gap-1 text-left text-[10.5px] text-acc outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"

const miniClass =
    "h-6 shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-2.5 text-[11px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-45"

const stepClass =
    "flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-surf3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-35"

const fieldClass =
    "w-[2.1ch] rounded-[4px] bg-transparent p-0 text-center font-mono text-[14px] font-medium text-foreground outline-none [font-variant-ligatures:none] hover:bg-surf3 focus:bg-acc-soft"

export function MuteAllControl() {
    const vm = useMuteAllControlViewModel()

    if (!vm.isMuted) {
        return (
            <button
                type="button"
                onClick={vm.muteUntilUnmuted}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-[12px] px-2.5 py-[7px] text-left text-[12.5px] text-muted-foreground outline-none transition-colors duration-150 hover:bg-surf focus-visible:ring-2 focus-visible:ring-ring"
            >
                <Bell className="h-3.5 w-3.5" />
                <span className="flex-1">Mute notifications</span>
            </button>
        )
    }

    return (
        <div className="rounded-[12px] bg-acc-soft pb-2 pl-2.5 pr-2 pt-[7px] shadow-[inset_0_0_0_1px_var(--accline)]">
            <div className="flex items-center gap-2.5">
                <BellOff className="h-3.5 w-3.5 shrink-0 text-acc" />
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[12.5px] font-semibold text-foreground">Notifications muted</span>
                    {!vm.isEditing && (
                        <button type="button" onClick={vm.startEditing} className={cn(linkClass, "mt-0.5 self-start")}>
                            {vm.hasEnd ? (
                                `${vm.untilLabel} · change`
                            ) : (
                                <>
                                    <Plus className="h-[11px] w-[11px]" />
                                    Set an end time
                                </>
                            )}
                        </button>
                    )}
                </span>
                <button
                    type="button"
                    onClick={vm.unmute}
                    className={cn(miniClass, "border-line2 bg-surf2 text-foreground hover:bg-surf3")}
                >
                    Unmute
                </button>
            </div>

            {vm.isEditing && (
                <div className="ml-6 mt-2 flex flex-col gap-2 animate-in fade-in-0 zoom-in-95 duration-150">
                    <div className="flex items-center gap-1.5 rounded-full border border-line2 bg-surf2 p-1">
                        <button
                            type="button"
                            aria-label="15 minutes less"
                            onClick={vm.stepDown}
                            disabled={!vm.canStepDown}
                            className={stepClass}
                        >
                            <Minus className="h-[13px] w-[13px]" />
                        </button>
                        <span className="flex flex-1 flex-col items-center leading-[1.15]">
                            <span
                                className={cn(
                                    "inline-flex items-center gap-px rounded-[8px] border border-transparent px-1 py-px transition-colors duration-150 focus-within:border-acc-line focus-within:bg-background",
                                    vm.isInvalid &&
                                        "border-[color-mix(in_oklab,var(--dnd)_60%,transparent)] focus-within:border-[color-mix(in_oklab,var(--dnd)_60%,transparent)]",
                                )}
                            >
                                <input
                                    aria-label="Hour"
                                    inputMode="numeric"
                                    maxLength={2}
                                    value={vm.fields[0]}
                                    onChange={(e) => vm.typeField(0, e.target.value)}
                                    onBlur={vm.settleFields}
                                    onFocus={(e) => e.target.select()}
                                    className={fieldClass}
                                />
                                <span aria-hidden className="font-mono text-[14px] text-muted-foreground">
                                    :
                                </span>
                                <input
                                    aria-label="Minutes"
                                    inputMode="numeric"
                                    maxLength={2}
                                    value={vm.fields[1]}
                                    onChange={(e) => vm.typeField(1, e.target.value)}
                                    onBlur={vm.settleFields}
                                    onFocus={(e) => e.target.select()}
                                    className={fieldClass}
                                />
                            </span>
                            <span className="text-[10px] text-muted-foreground">{vm.hint}</span>
                        </span>
                        <button
                            type="button"
                            aria-label="15 minutes more"
                            onClick={vm.stepUp}
                            disabled={!vm.canStepUp}
                            className={stepClass}
                        >
                            <Plus className="h-[13px] w-[13px]" />
                        </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={vm.hasEnd ? vm.muteUntilUnmuted : vm.cancelEditing}
                            className={linkClass}
                        >
                            {vm.hasEnd ? "Remove end" : "Cancel"}
                        </button>
                        <button
                            type="button"
                            onClick={vm.confirmEnd}
                            disabled={vm.isInvalid}
                            className={cn(
                                miniClass,
                                "border-transparent bg-acc font-semibold text-acc-ink hover:opacity-90",
                            )}
                        >
                            {vm.confirmLabel}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
