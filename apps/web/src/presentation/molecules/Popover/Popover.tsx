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
                className="z-50 outline-none"
            >
                <Dialog className="outline-none">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
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
