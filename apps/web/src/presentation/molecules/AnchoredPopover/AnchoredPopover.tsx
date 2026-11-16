import type { ReactNode, RefObject } from "react"
import { Dialog, OverlayArrow, Popover as AriaPopover } from "react-aria-components"
import { motion } from "motion/react"
import { cn } from "@/presentation/_libs/utils"
import { popoverSurface } from "@/presentation/molecules/Popover/popover-surface"

type Side = "right" | "left" | "top" | "bottom"

interface AnchoredPopoverProps {
    /** The element it points at; what opens it can be elsewhere (a menu item, a shortcut). */
    anchorRef: RefObject<Element | null>
    isOpen: boolean
    onClose: () => void
    /** Accessible name of the dialog. */
    label: string
    placement?: Side
    /** Gap in px between the element and the panel. */
    offset?: number
    /** Extra classes for the panel (width, padding…). */
    className?: string
    children: ReactNode
}

const growsFrom: Record<Side, string> = { right: "left", left: "right", top: "bottom", bottom: "top" }

/** A dialog beside an element, its caret pointing at it. */
export function AnchoredPopover({
    anchorRef,
    isOpen,
    onClose,
    label,
    placement = "right",
    offset = 14,
    className,
    children,
}: AnchoredPopoverProps) {
    return (
        <AriaPopover
            triggerRef={anchorRef}
            isOpen={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
            placement={placement}
            offset={offset}
            className="outline-none"
        >
            <Dialog aria-label={label} className="outline-none">
                <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    style={{ transformOrigin: growsFrom[placement] }}
                    className={cn(popoverSurface, className)}
                >
                    {children}
                </motion.div>
            </Dialog>
            {/* After the panel, and a pixel into it, so it covers the panel's border. */}
            <OverlayArrow className="group">
                <svg
                    width={14}
                    height={14}
                    viewBox="0 0 14 14"
                    aria-hidden
                    className={cn(
                        "block fill-popover stroke-line2",
                        "group-data-[placement=top]:-translate-y-px",
                        "group-data-[placement=bottom]:translate-y-px group-data-[placement=bottom]:rotate-180",
                        "group-data-[placement=right]:translate-x-px group-data-[placement=right]:rotate-90",
                        "group-data-[placement=left]:-translate-x-px group-data-[placement=left]:-rotate-90",
                    )}
                >
                    <path d="M0 0 L7 7 L14 0" />
                </svg>
            </OverlayArrow>
        </AriaPopover>
    )
}
