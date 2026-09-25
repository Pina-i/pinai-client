import {
    DialogTrigger,
    Popover as AriaPopover,
    Dialog,
    type PopoverProps as AriaPopoverProps,
} from "react-aria-components"
import { motion } from "motion/react"
import type { ReactNode } from "react"
import { cn } from "@/presentation/_libs/utils"

interface PopoverProps {
    /** RA-compatible button (e.g. our Button atom) that opens the popover. */
    trigger: ReactNode
    children: ReactNode
    placement?: AriaPopoverProps["placement"]
    /** Gap in pixels between trigger and popover. Defaults to RA's 8. */
    offset?: number
    isOpen?: boolean
    onOpenChange?: (isOpen: boolean) => void
    /** Tailwind className applied to the visible popover panel (use for width, radius, shadow…). */
    className?: string
}

interface PopoverCaretProps {
    /** `up` when the panel hangs below its trigger, `down` when it sits above. */
    side: "up" | "down"
    /** Horizontal placement, e.g. `right-6` or `left-6`. */
    className?: string
}

/** Diamond pointing at the trigger; inherits the panel background. */
export function PopoverCaret({ side, className }: PopoverCaretProps) {
    return (
        <div
            aria-hidden
            className={cn(
                "pointer-events-none absolute h-3.5 w-3.5 rotate-45 bg-inherit",
                side === "up" ? "-top-[7.5px] border-l border-t border-line2" : "-bottom-[7.5px] border-b border-r border-line2",
                className,
            )}
        />
    )
}

/** Picks a CSS transform-origin so the entrance scale grows out of the trigger side. */
function transformOriginFor(placement: AriaPopoverProps["placement"]): string {
    const [main = "bottom", cross] = String(placement ?? "bottom").split(" ")
    const mainOrigin =
        main === "bottom" ? "top"
        : main === "top" ? "bottom"
        : main === "left" ? "right"
        : main === "right" ? "left"
        : "center"
    let crossOrigin = ""
    if (cross === "start" || cross === "left") crossOrigin = "left"
    else if (cross === "end" || cross === "right") crossOrigin = "right"
    else if (cross === "top") crossOrigin = "top"
    else if (cross === "bottom") crossOrigin = "bottom"
    return crossOrigin ? `${mainOrigin} ${crossOrigin}` : mainOrigin
}

export function Popover({
    trigger,
    children,
    placement = "bottom end",
    offset,
    isOpen,
    onOpenChange,
    className,
}: PopoverProps) {
    return (
        <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
            {trigger}
            <AriaPopover
                placement={placement}
                offset={offset}
                className="outline-none"
            >
                <Dialog className="outline-none">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        style={{ transformOrigin: transformOriginFor(placement) }}
                        className={cn(className)}
                    >
                        {children}
                    </motion.div>
                </Dialog>
            </AriaPopover>
        </DialogTrigger>
    )
}
